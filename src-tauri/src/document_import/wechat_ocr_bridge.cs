using System;
using System.Collections;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

internal static class WeChatOcrBridge
{
    public sealed class Request
    {
        public string path { get; set; }
        public string[][] files { get; set; }
    }

    private static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    private static readonly Encoding Utf8 = new UTF8Encoding(false, true);
    private const int MaxOutput = 5 * 1024 * 1024;

    private static int Main()
    {
        Console.InputEncoding = Utf8;
        Console.OutputEncoding = Utf8;
        var output = Console.Out;
        Console.SetOut(TextWriter.Null);
        var json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024 };
        try
        {
            var request = json.Deserialize<Request>(Console.In.ReadToEnd());
            if (request.files != null)
            {
                Extract(request);
                return 0;
            }
            var markdown = Recognize(request.path);
            output.WriteLine(json.Serialize(new { protocolVersion = 1, markdown }));
            return 0;
        }
        catch (Exception error)
        {
            var code = error is TimeoutException ? "timeout" :
                error is OverflowException ? "output_too_large" : "wechat_ocr_failed";
            output.WriteLine(json.Serialize(new { protocolVersion = 1, error = code }));
            return 1;
        }
    }

    private static void Extract(Request request)
    {
        using (var archive = ZipFile.OpenRead(request.path))
        {
            foreach (var file in request.files)
            {
                var entry = archive.GetEntry(file[0]);
                var path = Path.GetFullPath(Path.Combine(Root, file[1]));
                if (entry == null || !path.StartsWith(Root, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException();
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                entry.ExtractToFile(path);
            }
        }
    }

    private static string Recognize(string path)
    {
        // 下载的程序集只在桥接进程中加载，数据目录与上游插件保持相同结构。
        var library = Assembly.LoadFrom(Path.Combine(Root, "WeChatOcr.dll"));
        library.GetType("WeChatOcr.DataLocation", true).GetMethod("SetBaseDirectory")
            .Invoke(null, new object[] { Root });
        var type = library.GetType("WeChatOcr.ImageOcr", true);
        var result = new ResultReceiver();
        var resultType = library.GetType("WeChatOcr.WeChatOcrResult", true);
        var callbackType = typeof(Action<,>).MakeGenericType(typeof(string), resultType);
        var callbackMethod = typeof(ResultReceiver).GetMethod("Receive").MakeGenericMethod(resultType);
        var callback = Delegate.CreateDelegate(callbackType, result, callbackMethod);
        using (var engine = (IDisposable)Activator.CreateInstance(type, new object[] { null }))
        {
            type.GetMethod("Run", new[] { typeof(string), callbackType }).Invoke(engine, new object[] { path, callback });
            var task = result.Text.Task;
            if (Task.WhenAny(task, Task.Delay(TimeSpan.FromSeconds(12))).GetAwaiter().GetResult() != task)
                throw new TimeoutException();
            return task.GetAwaiter().GetResult();
        }
    }

    private sealed class ResultReceiver
    {
        internal readonly TaskCompletionSource<string> Text = new TaskCompletionSource<string>();

        public void Receive<T>(string path, T result) where T : class
        {
            try
            {
                var details = typeof(T).GetProperty("OcrResult").GetValue(result);
                var lines = details == null ? null : (IEnumerable)details.GetType().GetProperty("SingleResult").GetValue(details);
                var markdown = new StringBuilder();
                var bytes = 0;
                if (lines != null)
                {
                    foreach (var item in lines)
                    {
                        var line = (string)item.GetType().GetProperty("SingleStrUtf8").GetValue(item);
                        if (String.IsNullOrWhiteSpace(line)) continue;
                        bytes += Utf8.GetByteCount(line) + 1;
                        if (bytes > MaxOutput) throw new OverflowException();
                        if (markdown.Length > 0) markdown.Append('\n');
                        markdown.Append(line);
                    }
                }
                Text.TrySetResult(markdown.ToString());
            }
            catch (Exception error)
            {
                Text.TrySetException(error);
            }
        }
    }
}
