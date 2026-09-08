using System.IO.Compression;
using System.Text.Json;
using NAudio.Wave;

static class AudioExports {
 public static void Export(string requestPath,string output) {
  var request=JsonSerializer.Deserialize<Request>(File.ReadAllText(requestPath),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})!;
  if(request.Parts.Length is <1 or >24||!new[]{"wav","mp3"}.Contains(request.Format))throw new Exception("invalidExport");
  Directory.CreateDirectory(output);
  if(request.Separate){
   if(request.Parts.Length==1){File.Copy(Path.ChangeExtension(request.Parts[0].File,request.Format),Path.Combine(output,"export."+request.Format));return;}
   using var zip=ZipFile.Open(Path.Combine(output,"export.zip"),ZipArchiveMode.Create);
   for(int i=0;i<request.Parts.Length;i++){
    var part=request.Parts[i];var name=new string(part.Name.Where(c=>!Path.GetInvalidFileNameChars().Contains(c)&&c!='/'&&c!='\\').ToArray()).Trim();
    zip.CreateEntryFromFile(Path.ChangeExtension(part.File,request.Format),$"{i+1:00} - {name[..Math.Min(name.Length,80)]}.{request.Format}",CompressionLevel.Fastest);
   }
   return;
  }
  var readers=request.Parts.Select(p=>new WaveFileReader(p.File)).ToArray();
  try {
   if(readers.Any(r=>r.WaveFormat.Encoding!=WaveFormatEncoding.Pcm||r.WaveFormat.BitsPerSample!=16||r.WaveFormat.Channels!=1||r.WaveFormat.SampleRate!=44100))throw new Exception("invalidAudioFormat");
   if(request.Parts.Any(p=>!float.IsFinite(p.Gain)||p.Gain<0||p.Gain>2))throw new Exception("invalidGain");
   const int count=32768;var pcm=new byte[count*2];var mixed=new float[count];float peak=0;
   int Block(){Array.Clear(mixed);int length=0;for(int i=0;i<readers.Length;i++){int bytes=readers[i].Read(pcm,0,pcm.Length);length=Math.Max(length,bytes/2);for(int j=0;j<bytes/2;j++)mixed[j]+=BitConverter.ToInt16(pcm,j*2)/32768f*request.Parts[i].Gain;}return length;}
   int length;while((length=Block())>0)for(int j=0;j<length;j++)peak=Math.Max(peak,Math.Abs(mixed[j]));
   foreach(var reader in readers)reader.Position=0;
   float scale=peak>.95f?.95f/peak:1;
   var wav=Path.Combine(output,"export.wav");
   using(var writer=new WaveFileWriter(wav,new WaveFormat(44100,16,1))){while((length=Block())>0){for(int j=0;j<length;j++){var value=(short)(Math.Clamp(mixed[j]*scale,-1f,1f)*32767);pcm[j*2]=(byte)value;pcm[j*2+1]=(byte)(value>>8);}writer.Write(pcm,0,length*2);}}
   if(request.Format=="mp3"){using var input=new WaveFileReader(wav);using var encoder=new NAudio.Lame.LameMP3FileWriter(Path.Combine(output,"export.mp3"),input.WaveFormat,192);input.CopyTo(encoder);}
  }finally{foreach(var reader in readers)reader.Dispose();}
 }
 public sealed record Part(string Id,string Name,string File,float Gain);
 public sealed record Request(Part[] Parts,string Format,bool Separate);
}
