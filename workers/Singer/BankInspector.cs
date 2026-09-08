// Inspect data only: never execute scripts supplied by a publisher package.
static class BankInspector {
 public static object Inspect(string archive) {
  var outer=Assets.Extract(Path.GetFullPath(archive));var roots=new List<(string Root,string? Inner)>{(outer,null)};
  foreach(var inner in Directory.EnumerateFiles(outer,"*.zip",SearchOption.AllDirectories).ToArray()) {
   if(roots.Count>=9)throw new Exception("tooManyNestedArchives");
   var relative=Path.GetRelativePath(outer,inner).Replace('\\','/');roots.Add((Assets.ExtractNested(outer,relative),relative));
  }
  var choices=new List<object>();
  foreach(var (root,inner) in roots)foreach(var file in Directory.EnumerateFiles(root,"dsconfig.yaml",SearchOption.AllDirectories)) {
   // Nested packages are represented by their own root, never twice.
   if(root==outer&&roots.Any(r=>r.Inner!=null&&file.StartsWith(r.Root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)))continue;
   if(new FileInfo(file).Length>100000)throw new Exception("configurationTooLarge");
   var config=NativeBank.Yaml.Deserialize<BankConfiguration>(File.ReadAllText(file));if(string.IsNullOrEmpty(config.Acoustic))continue;
   var home=Path.GetDirectoryName(file)!;var acoustic=NativeBank.Inside(home,config.Acoustic);if(!File.Exists(acoustic)||!acoustic.EndsWith(".onnx",StringComparison.OrdinalIgnoreCase))continue;
   var phones=NativeBank.ReadTokens(NativeBank.Inside(home,config.Phonemes));
   bool Has(string p)=>phones.ContainsKey(p)||phones.ContainsKey("en/"+p);
   var wordless=new[]{"aa","b","d","m","w","uw","ah","ae","p","iy"}.All(Has);
   var english=new[]{"aa","ae","ah","ao","aw","ay","b","ch","d","dh","eh","er","ey","f","g","hh","ih","iy","jh","k","l","m","n","ng","ow","oy","p","r","s","sh","t","th","uh","uw","v","w","y","z","zh"}.All(Has);
   var languages=new List<string>();if(english)languages.Add("en");foreach(var lang in new[]{"zh","ja"})if(File.Exists(Path.Combine(home,"dsdur","dsdict-"+lang+".yaml")))languages.Add(lang);
   var embedded=File.Exists(Path.Combine(home,"dsvocoder","vocoder.yaml"));
   choices.Add(new{dsConfig=Path.GetRelativePath(root,file).Replace('\\','/'),innerArchive=inner,vocoder=config.Vocoder,embeddedVocoder=embedded,speakers=config.Speakers,languageCodes=languages,wordless,sampleRate=config.SampleRate,hopSize=config.HopSize,numMelBins=config.NumMelBins,melBase=config.MelBase});
  }
  if(choices.Count==0)throw new Exception("noOnnxVoiceConfiguration: Supply an OpenUtau DiffSinger ONNX ZIP; training checkpoints and UTAU sample banks need a different engine.");
  return new{choices};
 }
}
