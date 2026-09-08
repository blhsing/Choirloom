using System.Text.Json;
using Microsoft.ML.OnnxRuntime;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

// Read the publisher's OpenUtau package in place. No model or configuration is rewritten.
sealed class NativeBank {
 public string Root="",Acoustic="",Vocoder="",DictionaryFile="";
 public Dictionary<string,long> Phones=new(),Languages=new();
 public BankConfiguration Config=new();public VocoderConfiguration VocoderConfig=new();
 public float[]? Speaker;public string SpeakerName="";
 public static readonly IDeserializer Yaml=new DeserializerBuilder().WithNamingConvention(UnderscoredNamingConvention.Instance).IgnoreUnmatchedProperties().Build();
 public static string Inside(string root,string relative){var file=Path.GetFullPath(Path.Combine(root,relative));if(!file.StartsWith(Path.GetFullPath(root)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("voicebankPath");return file;}
 public static async Task<NativeBank> Load(JsonElement bank,string cache){
  var result=new NativeBank();var bundle=await Assets.Fetch(bank.GetProperty("bundle"),cache);
  if(bank.TryGetProperty("innerArchive",out var inner))bundle=Assets.ExtractNested(bundle,inner.GetString()!);
  if(bank.TryGetProperty("dsConfig",out var configPath)){
   var configFile=Inside(bundle,configPath.GetString()!);result.Root=Path.GetDirectoryName(configFile)!;result.Config=Yaml.Deserialize<BankConfiguration>(File.ReadAllText(configFile));
   result.Acoustic=Inside(result.Root,result.Config.Acoustic);result.Phones=ReadTokens(Inside(result.Root,result.Config.Phonemes));
   if(result.Config.UseLangId)result.Languages=ReadTokens(Inside(result.Root,result.Config.Languages));
   var embedded=Path.Combine(result.Root,"dsvocoder","vocoder.yaml");
   if(File.Exists(embedded)){result.VocoderConfig=Yaml.Deserialize<VocoderConfiguration>(File.ReadAllText(embedded));result.Vocoder=Inside(Path.GetDirectoryName(embedded)!,result.VocoderConfig.Model);}
   else if(bank.TryGetProperty("vocoderBundle",out var vocoder)){
    var dir=await Assets.Fetch(vocoder,cache);var vc=Directory.GetFiles(dir,"vocoder.yaml",SearchOption.AllDirectories).FirstOrDefault();
    if(vc!=null){result.VocoderConfig=Yaml.Deserialize<VocoderConfiguration>(File.ReadAllText(vc));result.Vocoder=Inside(Path.GetDirectoryName(vc)!,result.VocoderConfig.Model);}
    else{result.Vocoder=Inside(dir,bank.GetProperty("vocoder").GetString()!);result.VocoderConfig.MelBase=bank.TryGetProperty("vocoderMelBase",out var mel)?mel.GetString()!:"e";}
   }else throw new Exception("vocoderMissing:"+result.Config.Vocoder);
   if(result.Config.Speakers.Length>0){result.SpeakerName=result.Config.Speakers[0];var bytes=File.ReadAllBytes(Inside(result.Root,result.SpeakerName+".emb"));if(bytes.Length!=result.Config.HiddenSize*4)throw new Exception("speakerEmbeddingSize");result.Speaker=new float[result.Config.HiddenSize];Buffer.BlockCopy(bytes,0,result.Speaker,0,bytes.Length);}
  }else{
   result.Acoustic=Inside(bundle,bank.GetProperty("acoustic").GetString()!);result.Root=Path.GetDirectoryName(result.Acoustic)!;
   result.Phones=ReadTokens(Inside(bundle,bank.GetProperty("phonemes").GetString()!));result.Languages=ReadTokens(Inside(bundle,bank.GetProperty("languages").GetString()!));
   result.Vocoder=Inside(await Assets.Fetch(bank.GetProperty("vocoderBundle"),cache),bank.GetProperty("vocoder").GetString()!);result.Config.UseContinuousAcceleration=true;result.Config.UseVariableDepth=true;result.Config.MaxDepth=.4;result.Config.MelBase="e";result.VocoderConfig.MelBase="e";
  }
  if(bank.TryGetProperty("dictionary",out var dictionary))result.DictionaryFile=await Assets.Fetch(dictionary,cache);
  if(result.Config.SampleRate!=result.VocoderConfig.SampleRate||result.Config.HopSize!=result.VocoderConfig.HopSize||result.Config.NumMelBins!=result.VocoderConfig.NumMelBins||result.Config.MelScale!=result.VocoderConfig.MelScale)throw new Exception("vocoderMismatch");
  if(!new[]{"e","10"}.Contains(result.Config.MelBase)||!new[]{"e","10"}.Contains(result.VocoderConfig.MelBase))throw new Exception("melBaseUnsupported");
  return result;
 }
 public static Dictionary<string,long> ReadTokens(string file){if(file.EndsWith(".json",StringComparison.OrdinalIgnoreCase))return JsonSerializer.Deserialize<Dictionary<string,long>>(File.ReadAllText(file))!;return File.ReadAllLines(file).Select((p,i)=>(p,i)).ToDictionary(x=>x.p,x=>(long)x.i);}
 public string Phone(string symbol){if(Phones.ContainsKey(symbol))return symbol;var plain=symbol.Split('/').Last();if(Phones.ContainsKey(plain))return plain;throw new Exception("unsupportedPhoneme:"+symbol);}
 public Dictionary<string,string[]> Pronunciations(string language){
  var paths=new[]{Path.Combine(Root,"dsdur","dsdict-"+language+".yaml"),Path.Combine(Root,"dsdict-"+language+".yaml")};
  foreach(var file in paths)if(File.Exists(file)){var reader=new DeserializerBuilder().WithNamingConvention(CamelCaseNamingConvention.Instance).IgnoreUnmatchedProperties().Build();var dict=reader.Deserialize<VoiceDictionary>(File.ReadAllText(file));return dict.Entries.GroupBy(e=>e.Grapheme).ToDictionary(g=>g.Key,g=>g.First().Phonemes);}
  return new();
 }
 public object Validate(){
  if(!Phones.ContainsKey("SP"))throw new Exception("silencePhonemeMissing");
  using var options=new SessionOptions{IntraOpNumThreads=1,InterOpNumThreads=1,EnableMemoryPattern=false,EnableCpuMemArena=false,GraphOptimizationLevel=GraphOptimizationLevel.ORT_ENABLE_BASIC};
  string[] names;using(var acoustic=new InferenceSession(Acoustic,options)){names=acoustic.InputMetadata.Keys.ToArray();var supported=new[]{"tokens","durations","f0","languages","spk_embed","depth","steps","speedup","gender","velocity","energy","breathiness","voicing","tension"};var unknown=names.Except(supported).ToArray();if(unknown.Length>0)throw new Exception("unsupportedModelInputs:"+string.Join(',',unknown));if(names.Contains("spk_embed")&&Speaker==null)throw new Exception("speakerEmbeddingMissing");}
  using(var vocoder=new InferenceSession(Vocoder,options)){if(!vocoder.InputMetadata.ContainsKey("mel")||!vocoder.InputMetadata.ContainsKey("f0"))throw new Exception("unsupportedVocoder");}
  return new{compatible=true,inputs=names,speaker=SpeakerName,phonemes=Phones.Count,sampleRate=Config.SampleRate,hopSize=Config.HopSize};
 }
}
sealed class BankConfiguration {
 public string Acoustic{get;set;}="";public string Phonemes{get;set;}="phonemes.txt";public string Languages{get;set;}="languages.json";public string Vocoder{get;set;}="";
 public string[] Speakers{get;set;}=Array.Empty<string>();public int HiddenSize{get;set;}=256;public bool UseLangId{get;set;}=false;public bool UseContinuousAcceleration{get;set;}=false;public bool UseVariableDepth{get;set;}=false;public double MaxDepth{get;set;}=1;
 public int SampleRate{get;set;}=44100;public int HopSize{get;set;}=512;public int NumMelBins{get;set;}=128;public string MelBase{get;set;}="10";public string MelScale{get;set;}="slaney";
}
sealed class VocoderConfiguration {
 public string Model{get;set;}="model.onnx";public int SampleRate{get;set;}=44100;public int HopSize{get;set;}=512;public int NumMelBins{get;set;}=128;public string MelBase{get;set;}="10";public string MelScale{get;set;}="slaney";
}
