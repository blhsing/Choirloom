using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpClient("node").ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { UseCookies = false, AllowAutoRedirect = false, AutomaticDecompression = DecompressionMethods.None });
var app = builder.Build();
var root = app.Environment.ContentRootPath;
var home = Environment.GetEnvironmentVariable("HOME") ?? root;
var data = Path.Combine(home, "data", "choirloom");
Directory.CreateDirectory(data);
var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
Process? node = null;
var nodeLock=new object();
void StartNode() { lock(nodeLock) { if(node is {HasExited:false})return;
    var start = new ProcessStartInfo(Path.Combine(root,"runtime","node.exe")) { WorkingDirectory=root, UseShellExecute=false, CreateNoWindow=true, RedirectStandardOutput=true, RedirectStandardError=true };
    start.ArgumentList.Add("--no-warnings"); start.ArgumentList.Add("app/server/index.js");
    start.Environment["PORT"] = port.ToString(); start.Environment["HOST"] = "127.0.0.1"; start.Environment["DATA_DIR"] = data;
    start.Environment["NODE_ENV"] = "production"; start.Environment["APP_ORIGIN"] = "https://test-officialwebsite.azurewebsites.net"; start.Environment["APP_BASE"] = "/Choirloom";
    start.Environment["CODEX_BIN"] = Path.Combine(root,"node_modules","@openai","codex-win32-x64","vendor","x86_64-pc-windows-msvc","bin","codex.exe");
    start.Environment["CHOIRLOOM_ASSET_SOURCE"]=Path.Combine(root,"assets");
    start.Environment["VOICEBANK_MANIFEST"]=Path.Combine(root,"config","voicebanks.json");
    start.Environment["NNSVS_COMMAND"]=Path.Combine(root,"singer","Singer.exe");
    node = new Process { StartInfo=start, EnableRaisingEvents=true };
    node.OutputDataReceived += (_,e) => { if(e.Data is not null) app.Logger.LogInformation("Choirloom: {Message}",e.Data); };
    node.ErrorDataReceived += (_,e) => { if(e.Data is not null) app.Logger.LogWarning("Choirloom: {Message}",e.Data); };
    node.Start(); node.BeginOutputReadLine(); node.BeginErrorReadLine(); }
}
StartNode();
app.Lifetime.ApplicationStopping.Register(() => { try { if(node is { HasExited:false }) node.Kill(true); } catch {} });
var assets = Path.Combine(root,"assets");Directory.CreateDirectory(assets);
app.UseStaticFiles(new StaticFileOptions { FileProvider=new PhysicalFileProvider(assets), RequestPath="/assets", ServeUnknownFileTypes=true, DefaultContentType="application/octet-stream", OnPrepareResponse=ctx=>ctx.Context.Response.Headers.CacheControl="public,max-age=86400" });
app.UseStaticFiles(new StaticFileOptions { FileProvider=new PhysicalFileProvider(Path.Combine(root,"dist")) });
app.Run(async context => {
    if(!context.Request.Path.StartsWithSegments("/api")) { context.Response.ContentType="text/html; charset=utf-8"; await context.Response.SendFileAsync(Path.Combine(root,"dist","index.html")); return; }
    if(node is null || node.HasExited) { StartNode(); await Task.Delay(1500,context.RequestAborted); }
    using var request = new HttpRequestMessage(new HttpMethod(context.Request.Method), $"http://127.0.0.1:{port}{context.Request.Path}{context.Request.QueryString}");
    if(context.Request.ContentLength>0 || context.Request.Headers.ContainsKey("Transfer-Encoding")) request.Content=new StreamContent(context.Request.Body);
    foreach(var h in context.Request.Headers) { if(h.Key.Equals("Host",StringComparison.OrdinalIgnoreCase)||h.Key.Equals("Connection",StringComparison.OrdinalIgnoreCase))continue; if(!request.Headers.TryAddWithoutValidation(h.Key,h.Value.ToArray()))request.Content?.Headers.TryAddWithoutValidation(h.Key,h.Value.ToArray()); }
    request.Headers.TryAddWithoutValidation("X-Forwarded-Proto","https");
    try { var client=context.RequestServices.GetRequiredService<IHttpClientFactory>().CreateClient("node");client.Timeout=Timeout.InfiniteTimeSpan;
        using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,context.RequestAborted);
        context.Response.StatusCode=(int)response.StatusCode;
        foreach(var h in response.Headers.Concat(response.Content.Headers)) if(!new[]{"transfer-encoding","connection","keep-alive"}.Contains(h.Key.ToLowerInvariant())) context.Response.Headers[h.Key]=h.Value.ToArray();
        await response.Content.CopyToAsync(context.Response.Body,context.RequestAborted);
    } catch(OperationCanceledException) when(context.RequestAborted.IsCancellationRequested) {} catch(HttpRequestException) { context.Response.StatusCode=503; await context.Response.WriteAsJsonAsync(new{error="starting"}); }
});
app.Run();
