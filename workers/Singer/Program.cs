using System.Text.Json;
using System.Security.Cryptography;
using System.IO.Compression;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

// Headless DiffSinger ONNX inference. Model weights are used unchanged.
// Asset cache is versioned and checksum verified; remote URLs come only from an operator manifest.
var opts=new Dictionary<string,string>();for(int i=0;i+1<args.Length;i+=2)opts[args[i]]=args[i+1];
if(opts.TryGetValue("--mix",out var mixRequest)){AudioExports.Export(mixRequest,Path.GetFullPath(opts["--output"]));return;}
if(opts.TryGetValue("--inspect-bank",out var bankArchive)){Console.WriteLine(JsonSerializer.Serialize(BankInspector.Inspect(bankArchive)));return;}
if(opts.TryGetValue("--omr",out var omrFile)){
 var engine=JsonDocument.Parse(File.ReadAllText(opts["--engine-manifest"])).RootElement;
 var engineCache=Path.GetFullPath(opts["--cache"]);Directory.CreateDirectory(engineCache);
 var engineDir=await Assets.Fetch(engine.GetProperty("bundle"),engineCache);
 var target=Path.GetFullPath(opts["--output"]);Directory.CreateDirectory(target);
 // Use Java's console launcher directly: jpackage's desktop launcher can wait on
 // an inaccessible desktop dialog inside an Azure App Service worker.
 var start=new System.Diagnostics.ProcessStartInfo(Path.Combine(engineDir,"Audiveris","runtime","bin","java.exe")){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=target};
 start.Environment["APPDATA"]=Path.Combine(engineCache,"audiveris-state");
 start.Environment["TESSDATA_PREFIX"]=Path.Combine(engineDir,"Audiveris","tessdata");
 foreach(var arg in new[]{"-Xms64m","-Xmx768m","-Djava.awt.headless=true","-Duser.home="+target,"--add-opens=java.desktop/java.awt=ALL-UNNAMED","--add-opens=java.desktop/sun.awt=ALL-UNNAMED","--add-exports=java.desktop/sun.awt.image=ALL-UNNAMED","--enable-native-access=ALL-UNNAMED","-Dfile.encoding=UTF-8","-cp",Path.Combine(AppContext.BaseDirectory,"audiveris-bootstrap.jar")+Path.PathSeparator+Path.Combine(engineDir,"Audiveris","app","*"),"AudiverisBootstrap","-batch","-transcribe","-export","-swap","-constant","org.audiveris.omr.text.Language.defaultSpecification="+opts.GetValueOrDefault("--language","eng"),"-output",target,"--",Path.GetFullPath(omrFile)})start.ArgumentList.Add(arg);
 using var process=System.Diagnostics.Process.Start(start)!;await process.WaitForExitAsync();Environment.ExitCode=process.ExitCode;return;
}
var manifestPath=opts["--voicebanks"];
var banks=JsonDocument.Parse(File.ReadAllText(manifestPath)).RootElement;
var cache=Path.GetFullPath(opts.GetValueOrDefault("--cache")??Path.Combine(Path.GetDirectoryName(Path.GetFullPath(manifestPath))!,"asset-cache"));Directory.CreateDirectory(cache);
if(opts.TryGetValue("--install",out var installId)){
 var bank=banks.EnumerateArray().First(b=>b.GetProperty("id").GetString()==installId);int i=0;
 var keys=new[]{"bundle","vocoderBundle","dictionary"}.Where(k=>bank.TryGetProperty(k,out _)).ToArray();
 foreach(var key in keys){Assets.Progress=p=>Console.WriteLine(JsonSerializer.Serialize(new{progress=(i*95+p*95/100)/keys.Length}));await Assets.Fetch(bank.GetProperty(key),cache);i++;}
 Console.WriteLine(JsonSerializer.Serialize((await NativeBank.Load(bank,cache)).Validate()));Console.WriteLine("{\"progress\":100}");return;
}

var input=JsonDocument.Parse(File.ReadAllText(opts["--score"])).RootElement;
var output=Path.GetFullPath(opts["--output"]);Directory.CreateDirectory(output);
var sampleRate=44100;var hop=512;double frameSeconds=(double)hop/sampleRate;
double Seconds(int tick){double seconds=0;int last=0;double bpm=input.GetProperty("tempo").GetDouble();if(input.TryGetProperty("tempoMap",out var map))foreach(var t in map.EnumerateArray().OrderBy(t=>t.GetProperty("tick").GetInt32())){int at=t.GetProperty("tick").GetInt32();if(at>tick)break;seconds+=(at-last)/480.0*60/bpm;last=at;bpm=t.GetProperty("bpm").GetDouble();}return seconds+(tick-last)/480.0*60/bpm;}
int lastTick=input.GetProperty("parts").EnumerateArray().SelectMany(p=>p.GetProperty("notes").EnumerateArray()).Select(n=>n.GetProperty("start").GetInt32()+n.GetProperty("duration").GetInt32()).DefaultIfEmpty(1920).Max();
var totalSamples=(int)Math.Ceiling((Seconds(lastTick)+.25)*sampleRate);var mix=new float[totalSamples];int partIndex=0;
foreach(var part in input.GetProperty("parts").EnumerateArray()){
 var bankId=part.GetProperty("voicebank").GetString();if(string.IsNullOrEmpty(bankId))throw new Exception("voicebankRequired");var bank=banks.EnumerateArray().First(b=>b.GetProperty("id").GetString()==bankId);
 var native=await NativeBank.Load(bank,cache);var acousticFile=native.Acoustic;var vocoderFile=native.Vocoder;var phones=native.Phones;var langMap=native.Languages;
 if(native.Config.SampleRate!=sampleRate||native.Config.HopSize!=hop)throw new Exception("unsupportedAudioTiming");
 var dictionary=new Dictionary<string,string[]>();if(native.DictionaryFile.Length>0)foreach(var line in File.ReadLines(native.DictionaryFile)){var split=line.Split('#')[0].Split(' ',StringSplitOptions.RemoveEmptyEntries);if(split.Length>1&&!split[0].StartsWith(";;;")){var key=split[0].Split('(')[0].ToLowerInvariant();dictionary.TryAdd(key,split.Skip(1).Select(p=>"en/"+new string(p.Where(c=>!char.IsDigit(c)).ToArray()).ToLowerInvariant()).ToArray());}}
 foreach(var entry in native.Pronunciations("en"))dictionary[entry.Key]=entry.Value;
 var stem=new float[totalSamples];var notes=part.GetProperty("notes").EnumerateArray().OrderBy(n=>n.GetProperty("start").GetInt32()).ToArray();int pattern=0;var resolved=new Dictionary<string,string[]>();
 var vowelSet=new HashSet<string>(new[]{"aa","ae","ah","ao","aw","ax","ay","eh","er","ey","ih","iy","ow","oy","uh","uw"});
 var yamlReader=new YamlDotNet.Serialization.DeserializerBuilder().WithNamingConvention(YamlDotNet.Serialization.NamingConventions.CamelCaseNamingConvention.Instance).IgnoreUnmatchedProperties().Build();
 var pronunciationRoot=Path.Combine(native.Root,"dsdur");
 foreach(var language in new[]{"zh","ja"}){var yamlFile=Path.Combine(pronunciationRoot,"dsdict-"+language+".yaml");if(!File.Exists(yamlFile))continue;var dict=yamlReader.Deserialize<VoiceDictionary>(File.ReadAllText(yamlFile));foreach(var symbol in dict.Symbols.Where(x=>x.Type=="vowel"))vowelSet.Add(symbol.Symbol.Split('/').Last());var words=dict.Entries.GroupBy(e=>e.Grapheme).ToDictionary(g=>g.Key,g=>g.First().Phonemes);foreach(var n in notes){var lyric=n.GetProperty("lyric").GetString()??"";string? roman=null;if(language=="zh"&&lyric.Length==1&&Pinyin.Pinyin.Instance.IsHanzi(lyric))roman=Pinyin.Pinyin.Instance.HanziToPinyin(new List<string>{lyric},Pinyin.ManTone.Style.NORMAL,Pinyin.Error.Default,false,false,false).ToStrList().FirstOrDefault();else if(language=="ja"&&Kana.Kana.IsKana(lyric))roman=Kana.Kana.KanaToRomaji(new List<string>{lyric},Kana.Error.Default,false).ToStrList().FirstOrDefault();else if(input.TryGetProperty("lyricsLanguage",out var languageValue)&&languageValue.GetString()==language)roman=lyric;if(roman!=null&&words.TryGetValue(roman,out var symbols))resolved[n.GetProperty("id").GetString()!]=symbols;}}
 string Clean(string text)=>text.Trim().Trim('.',',','!','?',':',';','，','。').ToLowerInvariant();
 for(int ni=0;ni<notes.Length;ni++){if(notes[ni].GetProperty("syllabic").GetString()!="begin")continue;int end=ni;while(end+1<notes.Length&&notes[end].GetProperty("syllabic").GetString()!="end")end++;var word=Clean(string.Concat(notes.Skip(ni).Take(end-ni+1).Select(n=>n.GetProperty("lyric").GetString())));if(!dictionary.TryGetValue(word,out var full))continue;var vowelIndexes=full.Select((p,i)=>(p,i)).Where(x=>vowelSet.Contains(x.p.Split('/').Last())).Select(x=>x.i).ToArray();int cursor=0;for(int j=ni;j<=end;j++){int cut=j==end?full.Length:Math.Clamp((j-ni+1<vowelIndexes.Length?vowelIndexes[j-ni+1]-1:(j-ni+1)*full.Length/(end-ni+1)),cursor+1,full.Length);resolved[notes[j].GetProperty("id").GetString()!]=full[cursor..cut];cursor=cut;if(cursor>=full.Length)break;}ni=end;}
 bool hasLyrics=notes.Any(n=>!string.IsNullOrWhiteSpace(n.GetProperty("lyric").GetString()));string previousVowel="en/aa";int previousEnd=-1;
 using var sessionOptions=new SessionOptions { IntraOpNumThreads=1,InterOpNumThreads=1,EnableMemoryPattern=false,EnableCpuMemArena=false,GraphOptimizationLevel=GraphOptimizationLevel.ORT_ENABLE_BASIC };
 // Process short phrases sequentially. Load only one native model at a time to bound peak RAM.
 foreach(var note in notes){if(note.GetProperty("pitch").ValueKind==JsonValueKind.Null){previousEnd=-1;continue;}if(new[]{"stop","continue"}.Contains(note.GetProperty("tie").GetString()))continue;int onset=note.GetProperty("start").GetInt32(),ticks=note.GetProperty("duration").GetInt32();if(note.GetProperty("tie").GetString()=="start"){int at=onset+ticks;foreach(var tied in notes.Where(n=>n.GetProperty("start").GetInt32()>=at)){if(tied.GetProperty("start").GetInt32()!=at||!new[]{"stop","continue"}.Contains(tied.GetProperty("tie").GetString()))break;ticks+=tied.GetProperty("duration").GetInt32();at=onset+ticks;if(tied.GetProperty("tie").GetString()=="stop")break;}}double duration=Seconds(onset+ticks)-Seconds(onset);if(duration>12)throw new Exception("phraseTooLong");
  string lyric=Clean(note.GetProperty("lyric").GetString()??"");bool continuation=hasLyrics&&lyric.Length==0&&previousEnd==onset;var wordless=part.GetProperty("wordless").GetString();if(string.IsNullOrWhiteSpace(lyric))lyric=wordless switch{"woo"=>"woo","ba"=>new[]{"ba","ba","bom"}[pattern%3],"da"=>new[]{"da","da","dum"}[pattern%3],"scat"=>new[]{"doo","ba","dap","doo","bwee","bom"}[pattern%6],_=>"ah"};pattern++;
  string[] symbols=continuation?new[]{previousVowel}:resolved.TryGetValue(note.GetProperty("id").GetString()!,out var syllable)?syllable:lyric.ToLowerInvariant() switch{"woo" or "woooo"=>new[]{"en/w","en/uw"},"doo"=>new[]{"en/d","en/uw"},"dap"=>new[]{"en/d","en/ae","en/p"},"bwee"=>new[]{"en/b","en/w","en/iy"},"ah" or "a"=>new[]{"en/aa"},"ba"=>new[]{"en/b","en/aa"},"bom"=>new[]{"en/b","en/aa","en/m"},"da"=>new[]{"en/d","en/aa"},"dum"=>new[]{"en/d","en/ah","en/m"},_=>dictionary.TryGetValue(lyric.ToLowerInvariant(),out var found)?found:lyric.StartsWith('[')&&lyric.EndsWith(']')?lyric[1..^1].Split(' ',StringSplitOptions.RemoveEmptyEntries):throw new Exception("unknownPronunciation:"+lyric)};
  symbols=symbols.Select(native.Phone).ToArray();previousVowel=symbols.LastOrDefault(s=>vowelSet.Contains(s.Split('/').Last()))??previousVowel;previousEnd=onset+ticks;foreach(var symbol in symbols)if(!phones.ContainsKey(symbol))throw new Exception("unsupportedPhoneme:"+symbol);
  int frames=Math.Max(symbols.Length,(int)Math.Round(duration/frameSeconds));int padding=8;
  var durations=new long[symbols.Length+2];durations[0]=padding;durations[^1]=padding;int remain=frames;var vowels=vowelSet;int vowel=Array.FindIndex(symbols,s=>vowels.Contains(s.Split('/').Last()));if(vowel<0)vowel=0;for(int i=0;i<symbols.Length;i++){durations[i+1]=i==vowel?0:Math.Max(1,Math.Min(6,frames/(symbols.Length+1)));remain-=(int)durations[i+1];}durations[vowel+1]=Math.Max(1,remain);
  int count=(int)durations.Sum();float frequency=(float)(440*Math.Pow(2,(note.GetProperty("pitch").GetInt32()-69)/12.0));var f0=Enumerable.Repeat(frequency,count).ToArray();var tokens=new[]{phones["SP"]}.Concat(symbols.Select(s=>phones[s])).Append(phones["SP"]).ToArray();var languages=new[]{0L}.Concat(symbols.Select(s=>langMap.GetValueOrDefault(s.Split('/')[0],0))).Append(0L).ToArray();float[] mel;int[] melShape;
  using(var acoustic=new InferenceSession(acousticFile,sessionOptions)){
   var values=new List<NamedOnnxValue>{NamedOnnxValue.CreateFromTensor("tokens",new DenseTensor<long>(tokens,new[]{1,tokens.Length})),NamedOnnxValue.CreateFromTensor("durations",new DenseTensor<long>(durations,new[]{1,durations.Length})),NamedOnnxValue.CreateFromTensor("f0",new DenseTensor<float>(f0,new[]{1,count})),NamedOnnxValue.CreateFromTensor("languages",new DenseTensor<long>(languages,new[]{1,languages.Length})),NamedOnnxValue.CreateFromTensor("depth",new DenseTensor<float>(new[]{(float)Math.Min(.4,native.Config.MaxDepth)},new[]{1})),NamedOnnxValue.CreateFromTensor("steps",new DenseTensor<long>(new[]{12L},new[]{1}))};
   foreach(var (name,value) in new[]{("gender",0f),("velocity",1f),("breathiness",-30f),("voicing",-6f),("tension",0f),("energy",-12f)})if(acoustic.InputMetadata.ContainsKey(name))values.Add(NamedOnnxValue.CreateFromTensor(name,new DenseTensor<float>(Enumerable.Repeat(value,count).ToArray(),new[]{1,count})));
   if(acoustic.InputMetadata.ContainsKey("spk_embed")){if(native.Speaker==null)throw new Exception("speakerEmbeddingMissing");var embeddings=new float[count*native.Speaker.Length];for(int frame=0;frame<count;frame++)Array.Copy(native.Speaker,0,embeddings,frame*native.Speaker.Length,native.Speaker.Length);values.Add(NamedOnnxValue.CreateFromTensor("spk_embed",new DenseTensor<float>(embeddings,new[]{1,count,native.Speaker.Length})));}
   if(acoustic.InputMetadata.ContainsKey("speedup"))values.Add(NamedOnnxValue.CreateFromTensor("speedup",new DenseTensor<long>(new[]{50L},new[]{1})));
   if(acoustic.InputMetadata.TryGetValue("depth",out var depth)&&depth.ElementType==typeof(long)){values.RemoveAll(v=>v.Name=="depth");values.Add(NamedOnnxValue.CreateFromTensor("depth",new DenseTensor<long>(new[]{(long)(Math.Min(.4,native.Config.MaxDepth)*1000)/50*50},new[]{1})));}
   values=values.Where(v=>acoustic.InputMetadata.ContainsKey(v.Name)).ToList();using var result=acoustic.Run(values);var tensor=result.First().AsTensor<float>();mel=tensor.ToArray();melShape=tensor.Dimensions.ToArray();
  }
  if(native.Config.MelBase!=native.VocoderConfig.MelBase){var factor=(float)(native.Config.MelBase=="10"?Math.Log(10):1/Math.Log(10));for(int m=0;m<mel.Length;m++)mel[m]*=factor;}
  using(var vocoder=new InferenceSession(vocoderFile,sessionOptions)){using var result=vocoder.Run(new[]{NamedOnnxValue.CreateFromTensor("mel",new DenseTensor<float>(mel,melShape)),NamedOnnxValue.CreateFromTensor("f0",new DenseTensor<float>(f0,new[]{1,count}))});var wave=result.First().AsTensor<float>().ToArray();int trim=padding*hop,at=(int)Math.Round(Seconds(onset)*sampleRate),length=Math.Min((int)Math.Round(duration*sampleRate),wave.Length-trim);for(int i=0;i<length&&at+i<stem.Length;i++){float envelope=Math.Min(1,Math.Min(i/180f,(length-1-i)/180f));stem[at+i]+=wave[trim+i]*envelope;}}
  Console.WriteLine(JsonSerializer.Serialize(new{part=partIndex,note=note.GetProperty("id").GetString()}));
 }
 var file=Path.Combine(output,part.GetProperty("id").GetString()+".wav");WriteWav(file,stem,sampleRate);float gain=part.GetProperty("gain").GetSingle();if(!part.GetProperty("muted").GetBoolean())for(int i=0;i<mix.Length;i++)mix[i]+=stem[i]*gain;partIndex++;
}
float peak=mix.Select(Math.Abs).DefaultIfEmpty(1).Max();if(peak>.95f)for(int i=0;i<mix.Length;i++)mix[i]*=.95f/peak;WriteWav(Path.Combine(output,"mix.wav"),mix,sampleRate);
foreach(var file in Directory.EnumerateFiles(output,"*.wav")){using var reader=new NAudio.Wave.WaveFileReader(file);using var writer=new NAudio.Lame.LameMP3FileWriter(Path.ChangeExtension(file,".mp3"),reader.WaveFormat,192);reader.CopyTo(writer);}
static void WriteWav(string path,float[] samples,int rate){using var writer=new BinaryWriter(File.Create(path));writer.Write("RIFF"u8);writer.Write(36+samples.Length*2);writer.Write("WAVEfmt "u8);writer.Write(16);writer.Write((short)1);writer.Write((short)1);writer.Write(rate);writer.Write(rate*2);writer.Write((short)2);writer.Write((short)16);writer.Write("data"u8);writer.Write(samples.Length*2);foreach(var f in samples)writer.Write((short)(Math.Clamp(f,-1f,1f)*32767));}
static class Assets {
 public static Action<int>? Progress;static long extractedBytes;
 public static async Task<string> Fetch(JsonElement entry,string cache){string id=entry.GetProperty("sha256").GetString()!;if(id.Length!=64||id.Any(c=>!Uri.IsHexDigit(c)))throw new Exception("invalidAssetHash");string file=Path.Combine(cache,id);string url=entry.GetProperty("url").GetString()!;var uri=new Uri(url);if(uri.Scheme!="https"||(!File.Exists(file)&&!((uri.Host=="test-officialwebsite.azurewebsites.net"&&uri.AbsolutePath.StartsWith("/Choirloom/assets/"))||(uri.Host=="github.com"&&System.Text.RegularExpressions.Regex.IsMatch(uri.AbsolutePath,@"^/[^/]+/[^/]+/releases/download/"))||(uri.Host=="neurosynth.neuros.click"&&uri.AbsolutePath=="/models/NeuroSynth-1.zip")||(uri.Host=="drive.usercontent.google.com"&&uri.AbsolutePath=="/download"))))throw new Exception("untrustedAssetHost");
  if(!File.Exists(file)){string tmp=file+".partial";var sourceRoot=Environment.GetEnvironmentVariable("CHOIRLOOM_ASSET_SOURCE");var local=sourceRoot is null?null:Path.Combine(sourceRoot,Uri.UnescapeDataString(uri.Segments.Last()));
   using var client=new HttpClient{Timeout=TimeSpan.FromMinutes(20)};HttpResponseMessage? response=null;Stream source;long? length;
   if(local is not null&&File.Exists(local)){source=File.OpenRead(local);length=source.Length;}else{response=await client.GetAsync(uri,HttpCompletionOption.ResponseHeadersRead);response.EnsureSuccessStatusCode();source=await response.Content.ReadAsStreamAsync();length=response.Content.Headers.ContentLength;}
   await using(source){await using var output=File.Create(tmp);var buffer=new byte[262144];long total=0;int previous=-1;while(true){int count=await source.ReadAsync(buffer);if(count==0)break;await output.WriteAsync(buffer.AsMemory(0,count));total+=count;int percent=(int)(total*90/(length??Math.Max(total,1)));if(percent!=previous){Progress?.Invoke(percent);previous=percent;}}}response?.Dispose();
   using(var stream=File.OpenRead(tmp)){var actual=Convert.ToHexString(SHA256.HashData(stream));if(!actual.Equals(id,StringComparison.OrdinalIgnoreCase)){File.Delete(tmp);throw new Exception("assetChecksum");}}File.Move(tmp,file,true);
  }
  return entry.TryGetProperty("archive",out var archive)&&archive.GetBoolean()?Extract(file):file;
 }
 public static string ExtractNested(string root,string relative){
  // Short, deterministic extraction paths avoid native Windows MAX_PATH failures.
  // Keep nested files inside the parent asset so removal and accounting remain correct.
  var file=NativeBank.Inside(root,relative);var key=Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(relative)))[..16];var destination=NativeBank.Inside(root,".voice-"+key);
  var legacy=NativeBank.Inside(root,relative+".files");if(!Directory.Exists(destination)&&File.Exists(Path.Combine(legacy,".complete")))Directory.Move(legacy,destination);
  return Extract(file,destination);
 }
 public static string Extract(string file,string? destination=null){string dir=Path.GetFullPath(destination??file+".files");if(!File.Exists(Path.Combine(dir,".complete"))){Directory.CreateDirectory(dir);using var zip=ZipFile.OpenRead(file);if(zip.Entries.Count>20000||(extractedBytes+=zip.Entries.Sum(e=>e.Length))>8L*1024*1024*1024||zip.Entries.Any(e=>e.Length>2L*1024*1024*1024||(e.ExternalAttributes>>16&0xF000)==0xA000))throw new Exception("archiveLimitsExceeded");if(new DriveInfo(Path.GetPathRoot(dir)!).AvailableFreeSpace<zip.Entries.Sum(e=>e.Length)+512L*1024*1024)throw new Exception("insufficientExtractionStorage");foreach(var item in zip.Entries){var target=NativeBank.Inside(dir,item.FullName);if(item.Name.Length==0){Directory.CreateDirectory(target);continue;}Directory.CreateDirectory(Path.GetDirectoryName(target)!);item.ExtractToFile(target,true);}File.WriteAllText(Path.Combine(dir,".complete"),"complete");}return dir;}

}

class VoiceDictionary { public VoiceSymbol[] Symbols {get;set;}=Array.Empty<VoiceSymbol>();public VoiceEntry[] Entries {get;set;}=Array.Empty<VoiceEntry>(); }
class VoiceSymbol {public string Symbol {get;set;}="";public string Type {get;set;}="";}
class VoiceEntry {public string Grapheme {get;set;}="";public string[] Phonemes {get;set;}=Array.Empty<string>();}

