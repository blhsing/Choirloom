using System.Diagnostics;
using NAudio.Wave;

// Stable Windows entry point for NNSVS and WAV/MP3 exports.
var opts=new Dictionary<string,string>();for(int i=0;i+1<args.Length;i+=2)opts[args[i]]=args[i+1];
if(opts.TryGetValue("--mix",out var request)){AudioExports.Export(request,Path.GetFullPath(opts["--output"]));return;}
var root=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"..","nnsvs"));
string Setting(string name,string fallback)=>string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(name))?fallback:Environment.GetEnvironmentVariable(name)!;
var python=Setting("NNSVS_PYTHON",Path.Combine(root,"python","python.exe"));
var script=Setting("NNSVS_WORKER",Path.Combine(root,"worker.py"));
var start=new ProcessStartInfo(python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
start.Environment["CHOIRLOOM_LAUNCHER_PID"]=Environment.ProcessId.ToString();
start.ArgumentList.Add("-X");start.ArgumentList.Add("utf8");start.ArgumentList.Add(script);
foreach(var arg in args)start.ArgumentList.Add(arg);
using var child=Process.Start(start)??throw new Exception("nnsvsUnavailable");
var stdout=child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
var stderr=child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
using var parentWatch=new System.Threading.Timer(_=>{if(int.TryParse(Environment.GetEnvironmentVariable("CHOIRLOOM_PARENT_PID"),out var pid))try{using var parent=Process.GetProcessById(pid);if(parent.HasExited){child.Kill(true);Environment.Exit(75);}}catch(ArgumentException){try{child.Kill(true);}catch{}Environment.Exit(75);}},null,1000,1000);
await child.WaitForExitAsync();await Task.WhenAll(stdout,stderr);if(child.ExitCode!=0){Environment.ExitCode=child.ExitCode;return;}
if(opts.ContainsKey("--score")&&!opts.ContainsKey("--validate-lyrics"))foreach(var file in Directory.GetFiles(opts["--output"],"*.wav")){
 using var input=new WaveFileReader(file);
 using var encoder=new NAudio.Lame.LameMP3FileWriter(Path.ChangeExtension(file,"mp3"),input.WaveFormat,192);input.CopyTo(encoder);
}
