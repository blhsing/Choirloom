using System.IO.Compression;

internal static class PortableRuntime
{
    public static string Resolve(string bundledRoot)
    {
        const string archive=@"C:\home\data\choirloom\nnsvs-runtime.zip";
        const string localRoot=@"C:\local\choirloom-nnsvs";
        if(!OperatingSystem.IsWindows()||!Directory.Exists(@"C:\local")||!File.Exists(archive))
            return Path.Combine(bundledRoot,"python","python.exe");
        var info=new FileInfo(archive);
        var directory=Path.Combine(localRoot,$"{info.Length}-{info.LastWriteTimeUtc.Ticks}");
        var python=Path.Combine(directory,"python","python.exe");
        var marker=Path.Combine(directory,"ready");
        if(File.Exists(marker)&&File.Exists(python))return python;
        using var mutex=new Mutex(false,@"Local\ChoirloomNnsvsRuntime");
        bool acquired=false;
        try
        {
            try{acquired=mutex.WaitOne(TimeSpan.FromMinutes(15));}
            catch(AbandonedMutexException){acquired=true;}
            if(!acquired)throw new TimeoutException("Singing runtime preparation is busy.");
            if(File.Exists(marker)&&File.Exists(python))return python;
            Console.Error.WriteLine("Preparing the local singing runtime cache.");
            Directory.CreateDirectory(directory);
            var localArchive=Path.Combine(directory,"runtime.zip");
            // One sequential network read; all extraction and subsequent imports use local disk.
            using(var source=new FileStream(archive,FileMode.Open,FileAccess.Read,FileShare.Read,1024*1024))
            using(var destination=new FileStream(localArchive,FileMode.Create,FileAccess.Write,FileShare.None,1024*1024))
                source.CopyTo(destination,1024*1024);
            ZipFile.ExtractToDirectory(localArchive,Path.Combine(directory,"python"),overwriteFiles:true);
            if(!File.Exists(python))throw new FileNotFoundException("The singing runtime is incomplete.");
            File.WriteAllText(marker,"ready");
            return python;
        }
        finally{if(acquired)mutex.ReleaseMutex();}
    }
}
