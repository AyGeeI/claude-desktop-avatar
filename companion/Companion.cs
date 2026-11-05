// Desktop-Begleiter der Mod "avatar": ein randloses, durchsichtiges
// WPF-Fenster mit der Figur, Sprechblase, Schnelleingabe, Sprachausgabe
// (System.Speech mit Lippensynchronität), Tönen, Tastenkürzel und
// Infobereich-Symbol.
//
// Wird von avatar.ps1 mit Windows PowerShell 5.1 (Add-Type) übersetzt; der
// Quelltext hält sich deshalb an C# 5 (keine $-Strings, kein ?., kein nameof).
//
// Protokoll:
//   Mod → Begleiter: <StateDir>\companion\state.json (wird laufend neu geschrieben)
//   Begleiter → Mod: JSON-Zeilen auf stdout (ready, prompt, command, moved,
//                    speaking, spoken, alive, error, log)

using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Speech.Synthesis;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Drawing = System.Drawing;
using Forms = System.Windows.Forms;

namespace ClaudeDesktopAvatar
{
    // ------------------------------------------------------------------ Einstieg

    public static class Program
    {
        public static int Run(string stateDir, string pluginRoot, string owner)
        {
            Out.Init();
            Native.MakeDpiAware();
            Mutex mutex = null;
            bool ownsMutex = false;
            try
            {
                mutex = new Mutex(false, "Local\\ClaudeDesktopAvatarCompanion");
                try { ownsMutex = mutex.WaitOne(TimeSpan.FromSeconds(8)); }
                catch (AbandonedMutexException) { ownsMutex = true; }
                if (!ownsMutex)
                {
                    Console.Error.WriteLine("Ein anderer Desktop-Avatar laeuft bereits.");
                    return 3;
                }
                SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(Dispatcher.CurrentDispatcher));
                Application app = new Application();
                app.ShutdownMode = ShutdownMode.OnExplicitShutdown;
                Companion companion = new Companion(app, stateDir, pluginRoot, owner ?? "");
                app.DispatcherUnhandledException += delegate(object sender, DispatcherUnhandledExceptionEventArgs e)
                {
                    Out.Error("ui: " + e.Exception.Message);
                    e.Handled = true;
                };
                app.Startup += delegate
                {
                    try { companion.Start(); }
                    catch (Exception error)
                    {
                        Console.Error.WriteLine("start: " + error.GetType().Name + ": " + error.Message);
                        companion.ExitCode = 1;
                        app.Shutdown(1);
                    }
                };
                app.Run();
                companion.Dispose();
                return companion.ExitCode;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error.GetType().Name + ": " + error.Message);
                return 1;
            }
            finally
            {
                if (mutex != null)
                {
                    if (ownsMutex) { try { mutex.ReleaseMutex(); } catch (Exception) { } }
                    mutex.Dispose();
                }
            }
        }
    }

    // ------------------------------------------------------------------ Ausgabe an die Mod

    public static class Out
    {
        private static Stream stream;
        private static readonly object gate = new object();
        public static bool IsBroken;

        public static void Init()
        {
            stream = Console.OpenStandardOutput();
        }

        public static void Send(Dictionary<string, object> message)
        {
            if (stream == null) return;
            byte[] bytes = Encoding.ASCII.GetBytes(Json.Write(message) + "\n");
            lock (gate)
            {
                try
                {
                    stream.Write(bytes, 0, bytes.Length);
                    stream.Flush();
                }
                catch (IOException) { IsBroken = true; }
                catch (ObjectDisposedException) { IsBroken = true; }
                catch (NotSupportedException) { IsBroken = true; }
            }
        }

        public static Dictionary<string, object> Message(string type)
        {
            Dictionary<string, object> message = new Dictionary<string, object>();
            message["type"] = type;
            return message;
        }

        public static void Log(string text)
        {
            Dictionary<string, object> message = Message("log");
            message["message"] = text;
            Send(message);
        }

        public static void Error(string text)
        {
            Dictionary<string, object> message = Message("error");
            message["message"] = text;
            Send(message);
        }

        public static void Command(string name, string value)
        {
            Dictionary<string, object> message = Message("command");
            message["name"] = name;
            if (value != null) message["value"] = value;
            Send(message);
        }
    }

    // ------------------------------------------------------------------ JSON

    public static class Json
    {
        private static readonly JavaScriptSerializer serializer = CreateSerializer();

        private static JavaScriptSerializer CreateSerializer()
        {
            JavaScriptSerializer created = new JavaScriptSerializer();
            created.MaxJsonLength = int.MaxValue;
            created.RecursionLimit = 64;
            return created;
        }

        public static Dictionary<string, object> ParseObject(string text)
        {
            object parsed = serializer.DeserializeObject(text);
            return parsed as Dictionary<string, object>;
        }

        public static Dictionary<string, object> Obj(Dictionary<string, object> from, string key)
        {
            object value;
            if (from == null || !from.TryGetValue(key, out value)) return null;
            return value as Dictionary<string, object>;
        }

        public static object[] Arr(Dictionary<string, object> from, string key)
        {
            object value;
            if (from == null || !from.TryGetValue(key, out value) || value == null) return new object[0];
            object[] array = value as object[];
            if (array != null) return array;
            ArrayList list = value as ArrayList;
            return list != null ? list.ToArray() : new object[0];
        }

        public static string Str(Dictionary<string, object> from, string key, string fallback)
        {
            object value;
            if (from == null || !from.TryGetValue(key, out value) || value == null) return fallback;
            string text = value as string;
            return text ?? Convert.ToString(value, CultureInfo.InvariantCulture);
        }

        public static double Num(Dictionary<string, object> from, string key, double fallback)
        {
            object value;
            if (from == null || !from.TryGetValue(key, out value) || value == null) return fallback;
            if (value is string || value is bool) return fallback;
            try { return Convert.ToDouble(value, CultureInfo.InvariantCulture); }
            catch (Exception) { return fallback; }
        }

        public static bool Bool(Dictionary<string, object> from, string key, bool fallback)
        {
            object value;
            if (from == null || !from.TryGetValue(key, out value) || !(value is bool)) return fallback;
            return (bool)value;
        }

        public static bool Has(Dictionary<string, object> from, string key)
        {
            return from != null && from.ContainsKey(key);
        }

        /// <summary>Schreibt JSON, nur ASCII (alles andere als \uXXXX).</summary>
        public static string Write(object value)
        {
            StringBuilder builder = new StringBuilder();
            WriteValue(builder, value);
            return builder.ToString();
        }

        private static void WriteValue(StringBuilder builder, object value)
        {
            if (value == null) { builder.Append("null"); return; }
            string text = value as string;
            if (text != null) { WriteString(builder, text); return; }
            if (value is bool) { builder.Append((bool)value ? "true" : "false"); return; }
            if (value is int || value is long || value is short || value is byte || value is uint)
            {
                builder.Append(Convert.ToString(value, CultureInfo.InvariantCulture));
                return;
            }
            if (value is double || value is float || value is decimal)
            {
                double number = Convert.ToDouble(value, CultureInfo.InvariantCulture);
                if (double.IsNaN(number) || double.IsInfinity(number)) builder.Append("0");
                else builder.Append(number.ToString("R", CultureInfo.InvariantCulture));
                return;
            }
            IDictionary dictionary = value as IDictionary;
            if (dictionary != null)
            {
                builder.Append('{');
                bool first = true;
                foreach (DictionaryEntry entry in dictionary)
                {
                    if (!first) builder.Append(',');
                    first = false;
                    WriteString(builder, Convert.ToString(entry.Key, CultureInfo.InvariantCulture));
                    builder.Append(':');
                    WriteValue(builder, entry.Value);
                }
                builder.Append('}');
                return;
            }
            IEnumerable sequence = value as IEnumerable;
            if (sequence != null)
            {
                builder.Append('[');
                bool first = true;
                foreach (object item in sequence)
                {
                    if (!first) builder.Append(',');
                    first = false;
                    WriteValue(builder, item);
                }
                builder.Append(']');
                return;
            }
            WriteString(builder, Convert.ToString(value, CultureInfo.InvariantCulture));
        }

        private static void WriteString(StringBuilder builder, string text)
        {
            builder.Append('"');
            foreach (char ch in text)
            {
                switch (ch)
                {
                    case '"': builder.Append("\\\""); break;
                    case '\\': builder.Append("\\\\"); break;
                    case '\n': builder.Append("\\n"); break;
                    case '\r': builder.Append("\\r"); break;
                    case '\t': builder.Append("\\t"); break;
                    default:
                        if (ch < 0x20 || ch > 0x7e) builder.Append("\\u").Append(((int)ch).ToString("x4"));
                        else builder.Append(ch);
                        break;
                }
            }
            builder.Append('"');
        }
    }

    // ------------------------------------------------------------------ Texte

    public static class Text
    {
        public static string Lang = "de";

        public static string T(string de, string en)
        {
            return Lang == "en" ? en : de;
        }

        public static string Clip(string text, int max)
        {
            if (string.IsNullOrEmpty(text)) return "";
            text = text.Replace("\r", " ").Replace("\n", " ").Trim();
            return text.Length <= max ? text : text.Substring(0, Math.Max(0, max - 1)).TrimEnd() + "…";
        }
    }

    // ------------------------------------------------------------------ Vorlage

    public sealed class PaletteEntry
    {
        public uint Fixed;
        public string Param;
        public double Shade;
        public double Alpha = -1;
    }

    public sealed class Template
    {
        public string Dir;
        public string PixelFile;
        public int Width;
        public int Height;
        public Dictionary<char, PaletteEntry> Palette = new Dictionary<char, PaletteEntry>();
        public Dictionary<string, string[]> Frames = new Dictionary<string, string[]>();
        public Dictionary<string, List<string>> StateFrames = new Dictionary<string, List<string>>();
        public Dictionary<string, double> StateFps = new Dictionary<string, double>();
        public Dictionary<string, string> Fallbacks = new Dictionary<string, string>();
        public Dictionary<string, Dictionary<string, List<string>>> Overlays = new Dictionary<string, Dictionary<string, List<string>>>();
        public Dictionary<string, string> Mouth = new Dictionary<string, string>();
        public bool Scanlines = true;
        public bool Flicker = true;
        public HashSet<string> Glitch = new HashSet<string>();
        public HashSet<string> Dim = new HashSet<string>();
        public PaletteEntry Glow;
        public Dictionary<string, string> VoiceHints = new Dictionary<string, string>();
        public string Name = "";

        public static Template Load(string dir, string pixelFile)
        {
            Template template = new Template();
            template.Dir = dir;
            template.PixelFile = pixelFile;
            Dictionary<string, object> manifest = Json.ParseObject(File.ReadAllText(System.IO.Path.Combine(dir, "avatar.json"), Encoding.UTF8));
            if (manifest == null) throw new InvalidDataException("avatar.json ist kein JSON-Objekt");
            Dictionary<string, object> pixel = Json.ParseObject(File.ReadAllText(System.IO.Path.Combine(dir, pixelFile), Encoding.UTF8));
            if (pixel == null) throw new InvalidDataException(pixelFile + " ist kein JSON-Objekt");

            Dictionary<string, object> names = Json.Obj(manifest, "name");
            template.Name = Json.Str(names, Text.Lang, Json.Str(names, "en", Json.Str(manifest, "id", "")));
            Dictionary<string, object> states = Json.Obj(manifest, "states");
            if (states != null)
            {
                foreach (KeyValuePair<string, object> state in states)
                {
                    string fallback = Json.Str(state.Value as Dictionary<string, object>, "fallback", null);
                    if (fallback != null) template.Fallbacks[state.Key] = fallback;
                }
            }
            Dictionary<string, object> voice = Json.Obj(manifest, "voice");
            if (voice != null)
            {
                foreach (KeyValuePair<string, object> hint in voice)
                {
                    string name = hint.Value as string;
                    if (!string.IsNullOrEmpty(name)) template.VoiceHints[hint.Key] = name;
                }
            }

            template.Width = (int)Json.Num(pixel, "width", 0);
            template.Height = (int)Json.Num(pixel, "height", 0);
            if (template.Width < 4 || template.Height < 4 || template.Width > 128 || template.Height > 128)
                throw new InvalidDataException("width/height muessen zwischen 4 und 128 liegen");

            Dictionary<string, object> palette = Json.Obj(pixel, "palette");
            if (palette != null)
            {
                foreach (KeyValuePair<string, object> entry in palette)
                {
                    if (entry.Key.Length != 1) continue;
                    template.Palette[entry.Key[0]] = ParseEntry(entry.Value);
                }
            }

            Dictionary<string, object> frames = Json.Obj(pixel, "frames");
            if (frames != null)
            {
                foreach (KeyValuePair<string, object> frame in frames)
                {
                    object[] rows = frame.Value as object[];
                    if (rows == null) { ArrayList list = frame.Value as ArrayList; if (list != null) rows = list.ToArray(); }
                    if (rows == null || rows.Length != template.Height) continue;
                    string[] lines = new string[rows.Length];
                    for (int i = 0; i < rows.Length; i++) lines[i] = Convert.ToString(rows[i], CultureInfo.InvariantCulture) ?? "";
                    template.Frames[frame.Key] = lines;
                }
            }

            Dictionary<string, object> pixelStates = Json.Obj(pixel, "states");
            if (pixelStates != null)
            {
                foreach (KeyValuePair<string, object> state in pixelStates)
                {
                    Dictionary<string, object> spec = state.Value as Dictionary<string, object>;
                    List<string> list = new List<string>();
                    foreach (object name in Json.Arr(spec, "frames"))
                    {
                        string frameName = name as string;
                        if (frameName != null && template.Frames.ContainsKey(frameName)) list.Add(frameName);
                    }
                    if (list.Count == 0) continue;
                    template.StateFrames[state.Key] = list;
                    template.StateFps[state.Key] = Math.Max(1, Math.Min(12, Json.Num(spec, "fps", 4)));
                }
            }
            if (!template.StateFrames.ContainsKey("idle")) throw new InvalidDataException("pixel.states braucht idle");

            Dictionary<string, object> overlays = Json.Obj(pixel, "overlays");
            if (overlays != null)
            {
                foreach (KeyValuePair<string, object> param in overlays)
                {
                    Dictionary<string, object> byValue = param.Value as Dictionary<string, object>;
                    if (byValue == null) continue;
                    Dictionary<string, List<string>> map = new Dictionary<string, List<string>>();
                    foreach (KeyValuePair<string, object> option in byValue)
                    {
                        List<string> list = new List<string>();
                        foreach (object name in Json.Arr(byValue, option.Key))
                        {
                            string frameName = name as string;
                            if (frameName != null && template.Frames.ContainsKey(frameName)) list.Add(frameName);
                        }
                        map[option.Key] = list;
                    }
                    template.Overlays[param.Key] = map;
                }
            }

            Dictionary<string, object> mouth = Json.Obj(pixel, "mouth");
            if (mouth != null)
            {
                foreach (KeyValuePair<string, object> shape in mouth)
                {
                    string frameName = shape.Value as string;
                    if (frameName != null && template.Frames.ContainsKey(frameName)) template.Mouth[shape.Key] = frameName;
                }
            }

            Dictionary<string, object> effects = Json.Obj(pixel, "effects");
            if (effects != null)
            {
                template.Scanlines = Json.Bool(effects, "scanlines", true);
                template.Flicker = Json.Bool(effects, "flicker", true);
                foreach (object state in Json.Arr(effects, "glitch")) { string s = state as string; if (s != null) template.Glitch.Add(s); }
                foreach (object state in Json.Arr(effects, "dim")) { string s = state as string; if (s != null) template.Dim.Add(s); }
                object glow;
                if (effects.TryGetValue("glow", out glow) && glow != null) template.Glow = ParseEntry(glow);
            }
            return template;
        }

        private static PaletteEntry ParseEntry(object value)
        {
            PaletteEntry entry = new PaletteEntry();
            string text = value as string;
            if (text != null)
            {
                entry.Fixed = Colors32.Parse(text);
                return entry;
            }
            Dictionary<string, object> spec = value as Dictionary<string, object>;
            if (spec != null)
            {
                entry.Param = Json.Str(spec, "param", null);
                entry.Shade = Json.Num(spec, "shade", 0);
                entry.Alpha = Json.Has(spec, "alpha") ? Math.Max(0, Math.Min(1, Json.Num(spec, "alpha", 1))) : -1;
            }
            return entry;
        }

        public string StateFor(string mood)
        {
            string state = mood;
            HashSet<string> seen = new HashSet<string>();
            while (!string.IsNullOrEmpty(state) && !seen.Contains(state))
            {
                if (StateFrames.ContainsKey(state)) return state;
                seen.Add(state);
                string next;
                state = Fallbacks.TryGetValue(state, out next) ? next : null;
            }
            return "idle";
        }

        public uint ColorOf(PaletteEntry entry, Dictionary<string, object> parameters)
        {
            if (entry == null) return 0;
            if (entry.Param == null) return entry.Fixed;
            object value = null;
            if (parameters != null) parameters.TryGetValue(entry.Param, out value);
            string text = value as string;
            uint color = Colors32.Parse(text != null ? text : "#ffffff");
            if (entry.Shade != 0) color = Colors32.Shade(color, entry.Shade);
            if (entry.Alpha >= 0) color = ((uint)Math.Round(entry.Alpha * 255) << 24) | (color & 0xffffff);
            return color;
        }

        public Dictionary<char, uint> Colors(Dictionary<string, object> parameters)
        {
            Dictionary<char, uint> colors = new Dictionary<char, uint>();
            foreach (KeyValuePair<char, PaletteEntry> entry in Palette) colors[entry.Key] = ColorOf(entry.Value, parameters);
            return colors;
        }

        public List<string> OverlayFrames(Dictionary<string, object> parameters)
        {
            List<string> result = new List<string>();
            foreach (KeyValuePair<string, Dictionary<string, List<string>>> param in Overlays)
            {
                object value = null;
                if (parameters != null) parameters.TryGetValue(param.Key, out value);
                string key = value is bool ? ((bool)value ? "true" : "false") : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
                List<string> frames;
                if (param.Value.TryGetValue(key, out frames)) result.AddRange(frames);
            }
            return result;
        }

        /// <summary>Setzt Frames übereinander (Alpha-Mischung "über"), Ergebnis ARGB.</summary>
        public uint[] Compose(IList<string> frameNames, Dictionary<char, uint> colors)
        {
            uint[] pixels = new uint[Width * Height];
            foreach (string name in frameNames)
            {
                string[] rows;
                if (name == null || !Frames.TryGetValue(name, out rows)) continue;
                for (int y = 0; y < Height; y++)
                {
                    string row = rows[y];
                    int limit = Math.Min(Width, row.Length);
                    for (int x = 0; x < limit; x++)
                    {
                        uint color;
                        if (!colors.TryGetValue(row[x], out color) || (color >> 24) == 0) continue;
                        int index = y * Width + x;
                        pixels[index] = Colors32.Over(color, pixels[index]);
                    }
                }
            }
            return pixels;
        }
    }

    public static class Colors32
    {
        public static uint Parse(string text)
        {
            if (string.IsNullOrEmpty(text) || text == "transparent" || text[0] != '#') return 0;
            string hex = text.Substring(1);
            uint value;
            if (hex.Length == 6 && uint.TryParse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out value)) return 0xff000000 | value;
            if (hex.Length == 8 && uint.TryParse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out value)) return ((value & 0xff) << 24) | (value >> 8);
            return 0;
        }

        public static uint Shade(uint argb, double shade)
        {
            uint a = argb >> 24;
            double s = Math.Max(-1, Math.Min(1, shade));
            double target = s >= 0 ? 255 : 0;
            double f = Math.Abs(s);
            uint r = (uint)Math.Round(((argb >> 16) & 255) + (target - ((argb >> 16) & 255)) * f);
            uint g = (uint)Math.Round(((argb >> 8) & 255) + (target - ((argb >> 8) & 255)) * f);
            uint b = (uint)Math.Round((argb & 255) + (target - (argb & 255)) * f);
            return (a << 24) | (r << 16) | (g << 8) | b;
        }

        public static uint Over(uint src, uint dst)
        {
            uint sa = src >> 24;
            if (sa == 255 || (dst >> 24) == 0) return src;
            double a = sa / 255.0;
            double da = (dst >> 24) / 255.0;
            double oa = a + da * (1 - a);
            if (oa <= 0) return 0;
            uint r = (uint)Math.Round((((src >> 16) & 255) * a + ((dst >> 16) & 255) * da * (1 - a)) / oa);
            uint g = (uint)Math.Round((((src >> 8) & 255) * a + ((dst >> 8) & 255) * da * (1 - a)) / oa);
            uint b = (uint)Math.Round(((src & 255) * a + (dst & 255) * da * (1 - a)) / oa);
            return ((uint)Math.Round(oa * 255) << 24) | (r << 16) | (g << 8) | b;
        }

        public static Color Wpf(uint argb)
        {
            return Color.FromArgb((byte)(argb >> 24), (byte)(argb >> 16), (byte)(argb >> 8), (byte)argb);
        }

        public static uint[] Glitch(uint[] pixels, int width, int height, uint seed)
        {
            uint[] result = (uint[])pixels.Clone();
            uint s = seed == 0 ? 1 : seed;
            Func<double> rand = delegate
            {
                s ^= s << 13;
                s ^= s >> 17;
                s ^= s << 5;
                return s / 4294967296.0;
            };
            int bands = 2 + (int)(rand() * 3);
            for (int band = 0; band < bands; band++)
            {
                int y0 = (int)(rand() * height);
                int h = 1 + (int)(rand() * 3);
                int shift = (rand() < 0.5 ? -1 : 1) * (1 + (int)(rand() * 2));
                for (int y = y0; y < Math.Min(height, y0 + h); y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        int from = x - shift;
                        result[y * width + x] = from >= 0 && from < width ? pixels[y * width + from] : 0;
                    }
                }
            }
            return result;
        }
    }

    // ------------------------------------------------------------------ Zeichnen

    /// <summary>Vergrößert ein Pixelbild ganzzahlig, mit Scanlines und Deckkraft, in eine WriteableBitmap (Pbgra32).</summary>
    public sealed class PixelCanvas
    {
        public WriteableBitmap Bitmap;
        private int[] buffer = new int[0];
        private int width;
        private int height;
        private int scale;

        public void Draw(uint[] pixels, int w, int h, int newScale, bool scanlines, double opacity)
        {
            if (Bitmap == null || w != width || h != height || newScale != scale)
            {
                width = w;
                height = h;
                scale = newScale;
                Bitmap = new WriteableBitmap(w * scale, h * scale, 96, 96, PixelFormats.Pbgra32, null);
                buffer = new int[w * scale * h * scale];
            }
            int outWidth = w * scale;
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    uint c = pixels[y * w + x];
                    double alpha = ((c >> 24) / 255.0) * opacity;
                    for (int dy = 0; dy < scale; dy++)
                    {
                        double light = 1.0;
                        if (scanlines && scale >= 3 && dy == scale - 1) light = 0.62;
                        else if (scanlines && scale == 2 && dy == 1 && (y % 2) == 1) light = 0.8;
                        int value = 0;
                        if (alpha > 0)
                        {
                            int a = (int)Math.Round(alpha * 255);
                            int r = (int)Math.Round(((c >> 16) & 255) * light * alpha);
                            int g = (int)Math.Round(((c >> 8) & 255) * light * alpha);
                            int b = (int)Math.Round((c & 255) * light * alpha);
                            value = (a << 24) | (r << 16) | (g << 8) | b;
                        }
                        int start = (y * scale + dy) * outWidth + x * scale;
                        for (int dx = 0; dx < scale; dx++) buffer[start + dx] = value;
                    }
                }
            }
            Bitmap.WritePixels(new Int32Rect(0, 0, outWidth, h * scale), buffer, outWidth * 4, 0);
        }
    }

    // ------------------------------------------------------------------ Sprachausgabe

    public sealed class SayItem
    {
        public long N;
        public string Text;
        public string Lang;
        public bool IsUrgent;
    }

    public sealed class Speaker : IDisposable
    {
        private SpeechSynthesizer synth;
        private readonly Dispatcher dispatcher;
        private readonly List<SayItem> queue = new List<SayItem>();
        private SayItem current;
        public bool CanSpeak;
        public bool IsSpeaking;
        public string Mouth = "closed";
        public string VoiceDe = "";
        public string VoiceEn = "";
        public Dictionary<string, string> Hints = new Dictionary<string, string>();
        public event Action Changed;
        public List<Dictionary<string, object>> Voices = new List<Dictionary<string, object>>();

        public Speaker(Dispatcher dispatcher)
        {
            this.dispatcher = dispatcher;
            try
            {
                synth = new SpeechSynthesizer();
                synth.SetOutputToDefaultAudioDevice();
                foreach (InstalledVoice voice in synth.GetInstalledVoices())
                {
                    if (!voice.Enabled) continue;
                    Dictionary<string, object> info = new Dictionary<string, object>();
                    info["name"] = voice.VoiceInfo.Name;
                    info["culture"] = voice.VoiceInfo.Culture != null ? voice.VoiceInfo.Culture.Name : "";
                    Voices.Add(info);
                }
                synth.VisemeReached += OnViseme;
                synth.SpeakStarted += delegate { dispatcher.BeginInvoke(new Action(OnStarted)); };
                synth.SpeakCompleted += delegate(object sender, SpeakCompletedEventArgs e) { dispatcher.BeginInvoke(new Action(OnCompleted)); };
                CanSpeak = Voices.Count > 0;
            }
            catch (Exception error)
            {
                CanSpeak = false;
                Out.Error("speech: " + error.Message);
            }
        }

        public void Enqueue(SayItem item)
        {
            if (!CanSpeak || item == null || string.IsNullOrEmpty(item.Text)) return;
            if (item.IsUrgent)
            {
                queue.Insert(0, item);
                if (current != null && !current.IsUrgent) synth.SpeakAsyncCancelAll();
            }
            else
            {
                queue.Add(item);
                if (queue.Count > 6) queue.RemoveRange(0, queue.Count - 6);
            }
            if (current == null) Next();
        }

        public void StopAll()
        {
            queue.Clear();
            if (synth != null && current != null) synth.SpeakAsyncCancelAll();
        }

        private void Next()
        {
            if (synth == null || queue.Count == 0)
            {
                current = null;
                return;
            }
            current = queue[0];
            queue.RemoveAt(0);
            try
            {
                CultureInfo culture = PickVoice(current.Lang);
                PromptBuilder prompt = new PromptBuilder(culture);
                prompt.AppendText(current.Text);
                synth.SpeakAsync(prompt);
            }
            catch (Exception error)
            {
                Out.Error("speech: " + error.Message);
                current = null;
                dispatcher.BeginInvoke(new Action(Next));
            }
        }

        private CultureInfo PickVoice(string lang)
        {
            string wanted = lang == "en" ? VoiceEn : VoiceDe;
            string hint;
            Hints.TryGetValue(lang, out hint);
            InstalledVoice chosen = null;
            InstalledVoice[] voices = synth.GetInstalledVoices().Where(v => v.Enabled).ToArray();
            if (!string.IsNullOrEmpty(wanted)) chosen = voices.FirstOrDefault(v => string.Equals(v.VoiceInfo.Name, wanted, StringComparison.OrdinalIgnoreCase));
            if (chosen == null && !string.IsNullOrEmpty(hint)) chosen = voices.FirstOrDefault(v => v.VoiceInfo.Name.IndexOf(hint, StringComparison.OrdinalIgnoreCase) >= 0 && v.VoiceInfo.Culture != null && v.VoiceInfo.Culture.Name.StartsWith(lang, StringComparison.OrdinalIgnoreCase));
            if (chosen == null) chosen = voices.FirstOrDefault(v => v.VoiceInfo.Culture != null && v.VoiceInfo.Culture.Name.StartsWith(lang, StringComparison.OrdinalIgnoreCase));
            if (chosen != null)
            {
                synth.SelectVoice(chosen.VoiceInfo.Name);
                return chosen.VoiceInfo.Culture;
            }
            return synth.Voice != null && synth.Voice.Culture != null ? synth.Voice.Culture : CultureInfo.CurrentUICulture;
        }

        private void OnViseme(object sender, VisemeReachedEventArgs e)
        {
            int viseme = e.Viseme;
            dispatcher.BeginInvoke(new Action(delegate
            {
                string shape;
                if (viseme == 0 || viseme == 21) shape = "closed";
                else if (viseme == 1 || viseme == 2 || viseme == 9 || viseme == 11) shape = "open";
                else if (viseme == 3 || viseme == 7 || viseme == 8 || viseme == 10) shape = "round";
                else shape = "half";
                if (shape != Mouth)
                {
                    Mouth = shape;
                    Raise();
                }
            }));
        }

        private void OnStarted()
        {
            IsSpeaking = true;
            Dictionary<string, object> message = Out.Message("speaking");
            message["isSpeaking"] = true;
            Out.Send(message);
            Raise();
        }

        private void OnCompleted()
        {
            if (current != null)
            {
                Dictionary<string, object> spoken = Out.Message("spoken");
                spoken["n"] = current.N;
                Out.Send(spoken);
            }
            current = null;
            Mouth = "closed";
            if (queue.Count > 0)
            {
                Next();
                return;
            }
            IsSpeaking = false;
            Dictionary<string, object> message = Out.Message("speaking");
            message["isSpeaking"] = false;
            Out.Send(message);
            Raise();
        }

        private void Raise()
        {
            Action handler = Changed;
            if (handler != null) handler();
        }

        public void Dispose()
        {
            if (synth == null) return;
            try { synth.SpeakAsyncCancelAll(); } catch (Exception) { }
            synth.Dispose();
            synth = null;
        }
    }

    // ------------------------------------------------------------------ Töne

    public sealed class Sounds
    {
        private readonly Dictionary<string, System.Media.SoundPlayer> players = new Dictionary<string, System.Media.SoundPlayer>(StringComparer.OrdinalIgnoreCase);

        public void Play(string path)
        {
            try
            {
                if (string.IsNullOrEmpty(path) || !File.Exists(path)) return;
                System.Media.SoundPlayer player;
                if (!players.TryGetValue(path, out player))
                {
                    player = new System.Media.SoundPlayer(path);
                    player.Load();
                    players[path] = player;
                }
                player.Play();
            }
            catch (Exception error)
            {
                Out.Log("sound: " + error.Message);
            }
        }
    }

    // ------------------------------------------------------------------ Win32

    public static class Native
    {
        public const int GWL_EXSTYLE = -20;
        public const int WS_EX_TRANSPARENT = 0x20;
        public const int WS_EX_TOOLWINDOW = 0x80;
        public const int WS_EX_LAYERED = 0x80000;
        public const int WS_EX_NOACTIVATE = 0x08000000;
        public const int WM_HOTKEY = 0x0312;
        public const uint MOD_ALT = 0x1;
        public const uint MOD_CONTROL = 0x2;
        public const uint MOD_SHIFT = 0x4;
        public const uint MOD_WIN = 0x8;
        public const uint MOD_NOREPEAT = 0x4000;

        [DllImport("user32.dll", SetLastError = true)]
        public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("shell32.dll")]
        public static extern int SHQueryUserNotificationState(out int state);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        [DllImport("shcore.dll")]
        private static extern int SetProcessDpiAwareness(int value);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        public static extern bool DestroyIcon(IntPtr handle);

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public InputUnion U;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        public static void MakeDpiAware()
        {
            try { AppContext.SetSwitch("Switch.System.Windows.DoNotScaleForDpiChanges", false); } catch (Exception) { }
            try
            {
                if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return;
            }
            catch (Exception) { }
            try { SetProcessDpiAwareness(2); } catch (Exception) { }
        }

        public static void SetExStyle(Window window, int add, int remove)
        {
            IntPtr hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == IntPtr.Zero) return;
            int style = GetWindowLong(hwnd, GWL_EXSTYLE);
            SetWindowLong(hwnd, GWL_EXSTYLE, (style | add) & ~remove);
        }

        /// <summary>Vollbild oder Präsentation: 2 = Vollbild-App, 3 = D3D-Vollbild, 4 = Präsentationsmodus.</summary>
        public static int NotificationState()
        {
            try
            {
                int state;
                if (SHQueryUserNotificationState(out state) == 0) return state;
            }
            catch (Exception) { }
            return 5;
        }

        /// <summary>Startet das Windows-Diktat (Win+H) für das fokussierte Eingabefeld.</summary>
        public static void StartDictation()
        {
            INPUT[] inputs = new INPUT[4];
            ushort[] keys = { 0x5B, 0x48, 0x48, 0x5B };
            uint[] flags = { 0, 0, 2, 2 };
            for (int i = 0; i < 4; i++)
            {
                inputs[i].type = 1;
                inputs[i].U.ki.wVk = keys[i];
                inputs[i].U.ki.dwFlags = flags[i];
            }
            SendInput(4, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        public static bool ParseHotkey(string text, out uint modifiers, out uint vk)
        {
            modifiers = 0;
            vk = 0;
            if (string.IsNullOrEmpty(text)) return false;
            foreach (string raw in text.Split('+'))
            {
                string part = raw.Trim().ToLowerInvariant();
                if (part.Length == 0) continue;
                if (part == "ctrl" || part == "control" || part == "strg") modifiers |= MOD_CONTROL;
                else if (part == "alt") modifiers |= MOD_ALT;
                else if (part == "shift" || part == "umschalt") modifiers |= MOD_SHIFT;
                else if (part == "win" || part == "windows") modifiers |= MOD_WIN;
                else
                {
                    Key key;
                    if (part == "space" || part == "leertaste") key = Key.Space;
                    else if (part.Length == 1 && char.IsDigit(part[0])) key = (Key)Enum.Parse(typeof(Key), "D" + part);
                    else if (!Enum.TryParse<Key>(part, true, out key)) return false;
                    vk = (uint)KeyInterop.VirtualKeyFromKey(key);
                }
            }
            return vk != 0 && modifiers != 0;
        }
    }

    public static class Screens
    {
        /// <summary>Arbeitsbereich (ohne Taskleiste) des Monitors, auf dem das Fenster steht, in WPF-Einheiten.</summary>
        public static Rect WorkAreaOf(Window window)
        {
            try
            {
                IntPtr hwnd = new WindowInteropHelper(window).Handle;
                PresentationSource source = PresentationSource.FromVisual(window);
                if (hwnd != IntPtr.Zero && source != null && source.CompositionTarget != null)
                {
                    Drawing.Rectangle area = Forms.Screen.FromHandle(hwnd).WorkingArea;
                    Matrix fromDevice = source.CompositionTarget.TransformFromDevice;
                    Point topLeft = fromDevice.Transform(new Point(area.Left, area.Top));
                    Point bottomRight = fromDevice.Transform(new Point(area.Right, area.Bottom));
                    return new Rect(topLeft, bottomRight);
                }
            }
            catch (Exception) { }
            return SystemParameters.WorkArea;
        }
    }

    // ------------------------------------------------------------------ Begleiter

    public sealed class Companion : IDisposable
    {
        private const int HotkeyId = 0x4344;
        private readonly Application app;
        private readonly string stateDir;
        private readonly string pluginRoot;
        private readonly string owner;
        private readonly string statePath;
        private readonly string windowPath;
        public int ExitCode;

        private AvatarWindow avatar;
        private BubbleWindow bubble;
        private InputWindow input;
        private Speaker speaker;
        private readonly Sounds sounds = new Sounds();
        private Forms.NotifyIcon tray;
        private IntPtr trayIcon = IntPtr.Zero;

        private DispatcherTimer pollTimer;
        private DispatcherTimer frameTimer;
        private DispatcherTimer slowTimer;
        private DispatcherTimer bubbleTimer;
        private readonly Random random = new Random();

        // Zustand von der Mod
        private Dictionary<string, object> state;
        private string lastStateText = "";
        private DateTime lastStateChange = DateTime.UtcNow;
        private DateTime lastPollAt = DateTime.UtcNow;
        private DateTime ownerMismatchSince = DateTime.MinValue;
        private bool isFirstState = true;
        private long lastBubbleN = -1;
        private long lastSayN = -1;
        private long lastSoundN = -1;
        private long lastStop = -1;
        private string mood = "idle";
        private string lang = "de";
        private string name = "Vela";
        private bool isVisible = true;
        private bool isGhost;
        private bool isLocallyHidden;
        private bool isAutoHidden;
        private bool isPresentation;
        private bool speechEnabled = true;
        private string hotkey = "";
        private bool hotkeyRegistered;
        private DateTime localScaleUntil = DateTime.MinValue;
        private int scale = 4;
        private string sessionsSignature = "";

        // Vorlage
        private Template template;
        private string templateKey = "";
        private Dictionary<string, object> parameters = new Dictionary<string, object>();
        private Dictionary<char, uint> colors = new Dictionary<char, uint>();
        private List<string> overlays = new List<string>();
        private readonly PixelCanvas canvas = new PixelCanvas();
        private int frameIndex;
        private string shownState = "";
        private DateTime flickerUntil = DateTime.MinValue;
        private DateTime nextFlicker = DateTime.UtcNow.AddSeconds(6);
        private DateTime glitchUntil = DateTime.MinValue;
        private DateTime nextGlitch = DateTime.UtcNow.AddSeconds(30);
        private DateTime bubbleHideAt = DateTime.MaxValue;
        private bool bubbleIsSticky;
        private bool bubbleIsHover;

        public Companion(Application app, string stateDir, string pluginRoot, string owner)
        {
            this.app = app;
            this.stateDir = stateDir;
            this.pluginRoot = pluginRoot;
            this.owner = owner;
            statePath = System.IO.Path.Combine(stateDir, "companion", "state.json");
            windowPath = System.IO.Path.Combine(stateDir, "companion", "window.json");
        }

        public void Start()
        {
            ReadState(true);
            avatar = new AvatarWindow(this);
            bubble = new BubbleWindow();
            bubble.Dismissed += delegate { bubbleHideAt = DateTime.MaxValue; HideBubble(); };
            input = new InputWindow(this);
            speaker = new Speaker(avatar.Dispatcher);
            speaker.Changed += delegate { RenderFrame(); };

            PlaceInitially();
            avatar.SourceReady += delegate { ApplyHotkey(); ApplyGhost(); };
            avatar.LocationChanged += delegate { PositionBubble(); input.Follow(avatar); };
            avatar.SizeChanged += delegate { PositionBubble(); };
            bubble.SizeChanged += delegate { PositionBubble(); };
            avatar.Show();
            CreateTray();
            ApplyState();
            RenderFrame();

            pollTimer = new DispatcherTimer(DispatcherPriority.Background);
            pollTimer.Interval = TimeSpan.FromMilliseconds(120);
            pollTimer.Tick += delegate { Guard(Poll); };
            pollTimer.Start();

            frameTimer = new DispatcherTimer(DispatcherPriority.Render);
            frameTimer.Interval = TimeSpan.FromMilliseconds(250);
            frameTimer.Tick += delegate { Guard(OnFrameTick); };
            frameTimer.Start();

            slowTimer = new DispatcherTimer(DispatcherPriority.Background);
            slowTimer.Interval = TimeSpan.FromSeconds(2);
            slowTimer.Tick += delegate { Guard(OnSlowTick); };
            slowTimer.Start();

            bubbleTimer = new DispatcherTimer(DispatcherPriority.Background);
            bubbleTimer.Interval = TimeSpan.FromMilliseconds(200);
            bubbleTimer.Tick += delegate { Guard(OnBubbleTick); };
            bubbleTimer.Start();

            Dictionary<string, object> ready = Out.Message("ready");
            ready["version"] = 1;
            ready["voices"] = speaker.Voices;
            ready["canSpeak"] = speaker.CanSpeak;
            ready["uiCulture"] = CultureInfo.CurrentUICulture.Name;
            Out.Send(ready);
        }

        public static void Guard(Action action)
        {
            try { action(); }
            catch (Exception error) { Out.Error(error.GetType().Name + ": " + error.Message); }
        }

        // -------------------------------------------------------------- Zustand lesen

        private void Poll()
        {
            DateTime now = DateTime.UtcNow;
            // Lange Pause zwischen zwei Abfragen: der Rechner hat geschlafen, keine tote Mod.
            if ((now - lastPollAt).TotalSeconds > 5) lastStateChange = now;
            lastPollAt = now;
            ReadState(false);
            if ((DateTime.UtcNow - lastStateChange).TotalSeconds > 20)
            {
                Out.Log("Keine Lebenszeichen der Mod mehr; der Desktop-Avatar beendet sich.");
                Quit(0);
            }
        }

        private void ReadState(bool initial)
        {
            string text;
            try
            {
                if (!File.Exists(statePath)) return;
                using (FileStream file = new FileStream(statePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                using (StreamReader reader = new StreamReader(file, Encoding.UTF8))
                {
                    text = reader.ReadToEnd();
                }
            }
            catch (IOException) { return; }
            catch (UnauthorizedAccessException) { return; }
            if (text == lastStateText) return;
            Dictionary<string, object> parsed;
            try { parsed = Json.ParseObject(text); }
            catch (Exception) { return; }
            if (parsed == null) return;
            lastStateText = text;
            lastStateChange = DateTime.UtcNow;
            state = parsed;
            if (!initial) ApplyState();
        }

        private void ApplyState()
        {
            if (state == null) return;
            if (Json.Bool(state, "quit", false))
            {
                Quit(0);
                return;
            }
            string stateOwner = Json.Str(state, "owner", "");
            if (owner.Length > 0 && stateOwner.Length > 0 && stateOwner != owner)
            {
                if (ownerMismatchSince == DateTime.MinValue) ownerMismatchSince = DateTime.UtcNow;
                else if ((DateTime.UtcNow - ownerMismatchSince).TotalSeconds > 6) { Quit(0); return; }
            }
            else ownerMismatchSince = DateTime.MinValue;

            lang = Json.Str(state, "lang", "de") == "en" ? "en" : "de";
            Text.Lang = lang;
            name = Json.Str(state, "name", "Vela");
            string newMood = Json.Str(state, "mood", "idle");
            if (newMood != mood)
            {
                mood = newMood;
                frameIndex = 0;
                if (mood == "error") glitchUntil = DateTime.UtcNow.AddMilliseconds(700);
            }
            isVisible = Json.Bool(state, "visible", true);
            isGhost = Json.Bool(state, "ghost", false);
            Dictionary<string, object> speech = Json.Obj(state, "speech");
            speechEnabled = Json.Bool(speech, "enabled", true);
            if (speaker != null)
            {
                speaker.VoiceDe = Json.Str(speech, "voiceDe", "");
                speaker.VoiceEn = Json.Str(speech, "voiceEn", "");
            }
            string newHotkey = Json.Str(state, "hotkey", "Ctrl+Alt+Space");
            if (newHotkey != hotkey)
            {
                hotkey = newHotkey;
                ApplyHotkey();
            }

            ApplyTemplate(Json.Obj(state, "template"));

            if (avatar != null)
            {
                avatar.SetTicker(TickerText(), Json.Obj(state, "plan"), Json.Str(state, "attention", "").Length > 0);
                avatar.SetWaiting(WaitingCount());
                avatar.SetMoodGlow(mood, GlowColor());
                ApplyGhost();
                ApplyVisibility();
            }
            if (tray != null) tray.Text = Text.Clip(Json.Str(state, "title", name), 60);

            // Neue Meldungen: Sprechblase, Ton, Ansagen, Abbruch
            Dictionary<string, object> bubbleState = Json.Obj(state, "bubble");
            long bubbleN = (long)Json.Num(bubbleState, "n", 0);
            long stop = (long)Json.Num(state, "stopSpeech", 0);
            Dictionary<string, object> sound = Json.Obj(state, "sound");
            long soundN = (long)Json.Num(sound, "n", 0);
            object[] say = Json.Arr(state, "say");
            double heartbeat = Json.Num(state, "heartbeatAt", 0);

            if (isFirstState)
            {
                isFirstState = false;
                lastBubbleN = bubbleN;
                lastStop = stop;
                lastSoundN = soundN;
                lastSayN = 0;
                foreach (object raw in say)
                {
                    Dictionary<string, object> item = raw as Dictionary<string, object>;
                    long n = (long)Json.Num(item, "n", 0);
                    double at = Json.Num(item, "at", 0);
                    if (heartbeat - at > 15000) lastSayN = Math.Max(lastSayN, n);
                }
            }

            if (stop != lastStop)
            {
                lastStop = stop;
                if (speaker != null) speaker.StopAll();
            }
            if (bubbleN != lastBubbleN)
            {
                lastBubbleN = bubbleN;
                ShowStateBubble(bubbleState);
            }
            if (soundN != lastSoundN)
            {
                lastSoundN = soundN;
                if (!isPresentation) sounds.Play(Json.Str(sound, "path", ""));
            }
            foreach (object raw in say)
            {
                Dictionary<string, object> item = raw as Dictionary<string, object>;
                long n = (long)Json.Num(item, "n", 0);
                if (n <= lastSayN) continue;
                lastSayN = n;
                if (!speechEnabled || isPresentation || speaker == null) continue;
                SayItem next = new SayItem();
                next.N = n;
                next.Text = Json.Str(item, "text", "");
                next.Lang = Json.Str(item, "lang", lang);
                next.IsUrgent = Json.Bool(item, "isUrgent", false);
                speaker.Enqueue(next);
            }
            if (bubbleIsSticky && Json.Str(state, "attention", "").Length == 0 && bubbleHideAt == DateTime.MaxValue)
                bubbleHideAt = DateTime.UtcNow.AddSeconds(8);
            string signature = Json.Write(Sessions().Select(one => Json.Str(one, "id", "") + "|" + Json.Str(one, "project", "") + "|" + Json.Bool(one, "needsYou", false)).ToArray());
            if (input != null && signature != sessionsSignature)
            {
                sessionsSignature = signature;
                input.SetSessions(Sessions());
            }
            RenderFrame();
        }

        private string TickerText()
        {
            string attention = Json.Str(state, "attention", "");
            if (attention.Length > 0) return attention;
            if (mood == "working" || mood == "thinking") return Json.Str(state, "step", "");
            return "";
        }

        private int WaitingCount()
        {
            int count = 0;
            foreach (object raw in Json.Arr(state, "sessions"))
            {
                Dictionary<string, object> session = raw as Dictionary<string, object>;
                if (session != null && Json.Bool(session, "needsYou", false) && !Json.Bool(session, "isSelf", false)) count++;
            }
            return count;
        }

        public List<Dictionary<string, object>> Sessions()
        {
            List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
            foreach (object raw in Json.Arr(state, "sessions"))
            {
                Dictionary<string, object> session = raw as Dictionary<string, object>;
                if (session != null) list.Add(session);
            }
            return list;
        }

        // -------------------------------------------------------------- Vorlage & Bild

        private void ApplyTemplate(Dictionary<string, object> spec)
        {
            if (spec == null) return;
            string dir = Json.Str(spec, "dir", "");
            string file = Json.Str(spec, "file", "pixel.json");
            int newScale = (int)Math.Max(2, Math.Min(8, Json.Num(spec, "scale", 4)));
            if (DateTime.UtcNow > localScaleUntil && newScale != scale)
            {
                scale = newScale;
                RenderFrame();
            }
            Dictionary<string, object> newParams = Json.Obj(spec, "params") ?? new Dictionary<string, object>();
            string key = dir + "|" + file;
            if (key != templateKey)
            {
                templateKey = key;
                try
                {
                    template = Template.Load(dir, file);
                    if (speaker != null) speaker.Hints = template.VoiceHints;
                }
                catch (Exception error)
                {
                    template = null;
                    Out.Error("template: " + error.Message);
                }
                parameters = null;
            }
            if (template != null && (parameters == null || Json.Write(newParams) != Json.Write(parameters)))
            {
                parameters = newParams;
                colors = template.Colors(parameters);
                overlays = template.OverlayFrames(parameters);
                UpdateTrayIcon();
            }
        }

        private Color GlowColor()
        {
            if (mood == "attention") return Color.FromRgb(0xff, 0xd2, 0x3f);
            if (mood == "error") return Color.FromRgb(0xff, 0x3b, 0x5c);
            if (template != null && template.Glow != null) return Colors32.Wpf(template.ColorOf(template.Glow, parameters) | 0xff000000);
            return Color.FromRgb(0x00, 0xe5, 0xff);
        }

        private string DisplayedState()
        {
            if (template == null) return "idle";
            string wanted = mood;
            if (speaker != null && speaker.IsSpeaking && (mood == "idle" || mood == "sleeping" || mood == "success" || mood == "thinking"))
                wanted = "speaking";
            return template.StateFor(wanted);
        }

        private void OnFrameTick()
        {
            if (template == null) return;
            string displayed = DisplayedState();
            double fps;
            if (!template.StateFps.TryGetValue(displayed, out fps)) fps = 4;
            int interval = (int)Math.Round(1000 / fps);
            if ((int)frameTimer.Interval.TotalMilliseconds != interval) frameTimer.Interval = TimeSpan.FromMilliseconds(interval);
            frameIndex++;
            DateTime now = DateTime.UtcNow;
            if (template.Flicker && now > nextFlicker)
            {
                flickerUntil = now.AddMilliseconds(90 + random.Next(80));
                nextFlicker = now.AddSeconds(4 + random.Next(6));
            }
            if (template.Flicker && now > nextGlitch && mood != "sleeping")
            {
                glitchUntil = now.AddMilliseconds(160);
                nextGlitch = now.AddSeconds(25 + random.Next(40));
            }
            RenderFrame();
        }

        public void RenderFrame()
        {
            if (avatar == null || template == null) return;
            string displayed = DisplayedState();
            if (displayed != shownState)
            {
                shownState = displayed;
                frameIndex = 0;
            }
            List<string> frames = template.StateFrames[displayed];
            List<string> layers = new List<string>();
            layers.Add(frames[frameIndex % frames.Count]);
            if (speaker != null && speaker.IsSpeaking)
            {
                string mouthFrame;
                if (template.Mouth.TryGetValue(speaker.Mouth, out mouthFrame)) layers.Add(mouthFrame);
            }
            layers.AddRange(overlays);
            uint[] pixels = template.Compose(layers, colors);
            DateTime now = DateTime.UtcNow;
            bool glitching = (template.Glitch.Contains(displayed) && frameIndex % 2 == 0) || now < glitchUntil;
            if (glitching) pixels = Colors32.Glitch(pixels, template.Width, template.Height, (uint)(frameIndex * 7919 + 17 + random.Next(1000)));
            double opacity = template.Dim.Contains(displayed) ? 0.62 : 1.0;
            if (now < flickerUntil) opacity *= 0.74;
            canvas.Draw(pixels, template.Width, template.Height, scale, template.Scanlines, opacity);
            avatar.ShowBitmap(canvas.Bitmap, scale);
        }

        private void UpdateTrayIcon()
        {
            if (tray == null || template == null) return;
            try
            {
                List<string> layers = new List<string>();
                layers.Add(template.StateFrames["idle"][0]);
                layers.AddRange(overlays);
                uint[] pixels = template.Compose(layers, colors);
                int size = Math.Min(template.Width, template.Height);
                int offsetX = (template.Width - size) / 2;
                using (Drawing.Bitmap bitmap = new Drawing.Bitmap(32, 32, Drawing.Imaging.PixelFormat.Format32bppArgb))
                {
                    for (int y = 0; y < 32; y++)
                    {
                        for (int x = 0; x < 32; x++)
                        {
                            int sx = offsetX + x * size / 32;
                            int sy = 2 + y * size / 32;
                            uint c = sy < template.Height ? pixels[sy * template.Width + sx] : 0;
                            bitmap.SetPixel(x, y, Drawing.Color.FromArgb((int)(c >> 24), (int)((c >> 16) & 255), (int)((c >> 8) & 255), (int)(c & 255)));
                        }
                    }
                    IntPtr handle = bitmap.GetHicon();
                    Drawing.Icon icon = Drawing.Icon.FromHandle(handle);
                    tray.Icon = icon;
                    if (trayIcon != IntPtr.Zero) Native.DestroyIcon(trayIcon);
                    trayIcon = handle;
                }
            }
            catch (Exception error)
            {
                Out.Log("tray icon: " + error.Message);
            }
        }

        // -------------------------------------------------------------- Langsamer Takt

        private void OnSlowTick()
        {
            if (Out.IsBroken)
            {
                Quit(0);
                return;
            }
            Out.Send(Out.Message("alive"));
            int notification = Native.NotificationState();
            bool shouldHide = notification == 2 || notification == 3 || notification == 4;
            isPresentation = notification == 4;
            if (shouldHide != isAutoHidden)
            {
                isAutoHidden = shouldHide;
                ApplyVisibility();
            }
        }

        private void ApplyVisibility()
        {
            if (avatar == null) return;
            bool show = isVisible && !isLocallyHidden && !isAutoHidden;
            if (show && !avatar.IsVisible) avatar.Show();
            if (!show && avatar.IsVisible)
            {
                avatar.Hide();
                HideBubble();
                input.Hide();
            }
        }

        private void ApplyGhost()
        {
            if (avatar == null) return;
            avatar.SetGhost(isGhost);
        }

        private void ApplyHotkey()
        {
            if (avatar == null || avatar.Handle == IntPtr.Zero) return;
            if (hotkeyRegistered)
            {
                Native.UnregisterHotKey(avatar.Handle, HotkeyId);
                hotkeyRegistered = false;
            }
            uint modifiers;
            uint vk;
            if (!Native.ParseHotkey(hotkey, out modifiers, out vk))
            {
                if (!string.IsNullOrEmpty(hotkey)) Out.Log("Tastenkuerzel nicht erkannt: " + hotkey);
                return;
            }
            hotkeyRegistered = Native.RegisterHotKey(avatar.Handle, HotkeyId, modifiers | Native.MOD_NOREPEAT, vk);
            if (!hotkeyRegistered) Out.Log("Tastenkuerzel " + hotkey + " ist schon belegt.");
        }

        public void OnHotkey(int id)
        {
            if (id != HotkeyId) return;
            if (isLocallyHidden || !isVisible)
            {
                isLocallyHidden = false;
                ApplyVisibility();
            }
            ToggleInput();
        }

        // -------------------------------------------------------------- Sprechblase

        private void ShowStateBubble(Dictionary<string, object> spec)
        {
            if (spec == null) return;
            List<string> lines = new List<string>();
            foreach (object raw in Json.Arr(spec, "lines"))
            {
                string line = raw as string;
                if (!string.IsNullOrEmpty(line)) lines.Add(line);
            }
            double showMs = Json.Num(spec, "showMs", 6000);
            if (lines.Count == 0 || showMs < 0) return;
            bool isUrgent = Json.Bool(spec, "isUrgent", false);
            ShowBubble(name, lines, isUrgent, showMs, false);
        }

        public void ShowBubble(string title, List<string> lines, bool isUrgent, double showMs, bool isHover)
        {
            if (avatar == null || !avatar.IsVisible) return;
            if (isHover && bubble.IsVisible && !bubbleIsHover) return;
            bubbleIsHover = isHover;
            bubbleIsSticky = showMs == 0 && !isHover;
            bubbleHideAt = showMs > 0 ? DateTime.UtcNow.AddMilliseconds(showMs) : DateTime.MaxValue;
            bubble.SetContent(title, lines, isUrgent, isUrgent ? Color.FromRgb(0xff, 0xd2, 0x3f) : GlowColor(), !isHover);
            if (!bubble.IsVisible) bubble.Show();
            PositionBubble();
        }

        public void HideBubble()
        {
            bubbleIsSticky = false;
            bubbleIsHover = false;
            if (bubble != null && bubble.IsVisible) bubble.Hide();
        }

        public void HideHoverBubble()
        {
            if (bubbleIsHover) HideBubble();
        }

        private void OnBubbleTick()
        {
            if (bubble != null && bubble.IsVisible && DateTime.UtcNow > bubbleHideAt)
            {
                bubbleHideAt = DateTime.MaxValue;
                HideBubble();
            }
        }

        private void PositionBubble()
        {
            if (bubble == null || !bubble.IsVisible || avatar == null) return;
            bubble.UpdateLayout();
            Rect work = Screens.WorkAreaOf(avatar);
            Rect figure = avatar.FigureBounds();
            double width = bubble.ActualWidth;
            double height = bubble.ActualHeight;
            double left = figure.Left + figure.Width / 2 - width / 2;
            double top = figure.Top - height - 4;
            bool below = top < work.Top;
            if (below) top = figure.Bottom + 4;
            left = Math.Max(work.Left + 4, Math.Min(work.Right - width - 4, left));
            top = Math.Max(work.Top + 4, Math.Min(work.Bottom - height - 4, top));
            bubble.Left = left;
            bubble.Top = top;
            bubble.SetTail(figure.Left + figure.Width / 2 - left, below);
        }

        public void ShowSessionsOverview(bool isHover)
        {
            List<string> lines = new List<string>();
            foreach (Dictionary<string, object> session in Sessions())
            {
                bool needsYou = Json.Bool(session, "needsYou", false);
                string m = Json.Str(session, "mood", "idle");
                string dot = needsYou ? "◆" : (m == "working" || m == "thinking") ? "●" : "○";
                string step = Json.Str(session, "step", "");
                string line = dot + " " + Json.Str(session, "project", "?") + " · " + (needsYou ? Text.T("wartet auf dich", "waiting for you") : Json.Str(session, "label", m));
                if (step.Length > 0 && !needsYou) line += " · " + step;
                lines.Add(Text.Clip(line, 90));
            }
            if (lines.Count == 0) lines.Add(Text.T("Keine Sitzung aktiv.", "No active session."));
            ShowBubble(Text.T("Sitzungen", "Sessions"), lines, false, isHover ? 0 : 6000, isHover);
        }

        // -------------------------------------------------------------- Bedienung

        public void ToggleInput()
        {
            if (input.IsVisible) input.Hide();
            else
            {
                input.SetSessions(Sessions());
                input.Open(avatar, name);
            }
        }

        public void SendPrompt(string text, string sessionId)
        {
            Dictionary<string, object> message = Out.Message("prompt");
            message["text"] = text;
            if (!string.IsNullOrEmpty(sessionId)) message["session"] = sessionId;
            Out.Send(message);
            List<string> lines = new List<string>();
            lines.Add("→ " + Text.Clip(text, 100));
            ShowBubble(name, lines, false, 2500, false);
        }

        public void SetScale(int newScale)
        {
            newScale = Math.Max(2, Math.Min(8, newScale));
            if (newScale == scale) return;
            scale = newScale;
            localScaleUntil = DateTime.UtcNow.AddSeconds(3);
            RenderFrame();
            ReportMoved();
        }

        public int Scale { get { return scale; } }

        public void ReportMoved()
        {
            Dictionary<string, object> message = Out.Message("moved");
            message["x"] = (int)Math.Round(avatar.Left);
            message["y"] = (int)Math.Round(avatar.Top);
            message["scale"] = scale;
            Out.Send(message);
            SavePosition();
        }

        public void ToggleLocalHide()
        {
            isLocallyHidden = !isLocallyHidden;
            ApplyVisibility();
        }

        public void ShowAbout()
        {
            List<string> lines = new List<string>();
            lines.Add("claude-desktop-avatar · " + Text.T("Vorlage", "template") + ": " + (template != null ? template.Name : "?"));
            lines.Add(Text.T("Klick: fragen · Doppelklick: Status · Rechtsklick: Menü", "Click: ask · double-click: status · right-click: menu"));
            lines.Add(Text.T("Strg+Mausrad: Größe · ", "Ctrl+wheel: size · ") + hotkey + Text.T(": Eingabe", ": input"));
            ShowBubble(name, lines, false, 9000, false);
        }

        public string Verbosity { get { return Json.Str(state, "verbosity", "normal"); } }
        public bool VoiceMode { get { return Json.Bool(state, "voiceMode", false); } }
        public bool SpeechEnabled { get { return speechEnabled; } }
        public bool IsGhost { get { return isGhost; } }
        public string Name { get { return name; } }

        public ContextMenu BuildMenu()
        {
            ContextMenu menu = new ContextMenu();
            menu.Items.Add(Item(Text.T("Fragen …", "Ask …"), delegate { ToggleInput(); }, false));
            menu.Items.Add(Item(Text.T("Status ansagen", "Say status"), delegate { Out.Command("status", null); }, false));
            menu.Items.Add(Item(Text.T("Sitzungen zeigen", "Show sessions"), delegate { ShowSessionsOverview(false); }, false));
            menu.Items.Add(Item(Text.T("Letzte Antwort zusammenfassen", "Summarize last answer"), delegate { Out.Command("summary", null); }, false));
            menu.Items.Add(Item(Text.T("Wiederholen", "Repeat"), delegate { Out.Command("repeat", null); }, false));
            menu.Items.Add(Item(Text.T("Auftrag stoppen", "Stop the task"), delegate { Out.Command("stop", null); }, false));
            menu.Items.Add(new Separator());
            MenuItem verbosity = new MenuItem();
            verbosity.Header = Text.T("Ausführlichkeit", "Verbosity");
            string[] values = { "quiet", "normal", "chatty" };
            string[] labels = { Text.T("Leise", "Quiet"), Text.T("Normal", "Normal"), Text.T("Gesprächig", "Chatty") };
            for (int i = 0; i < values.Length; i++)
            {
                string value = values[i];
                MenuItem option = Item(labels[i], delegate { Out.Command("verbosity", value); }, Verbosity == value);
                verbosity.Items.Add(option);
            }
            menu.Items.Add(verbosity);
            menu.Items.Add(Item(Text.T("Sprachmodus", "Voice mode"), delegate { Out.Command("voiceMode", null); }, VoiceMode));
            menu.Items.Add(Item(Text.T("Sprachausgabe", "Speech"), delegate { Out.Command("speech", null); }, speechEnabled));
            MenuItem size = new MenuItem();
            size.Header = Text.T("Größe", "Size");
            for (int n = 2; n <= 8; n++)
            {
                int chosen = n;
                size.Items.Add(Item(n + "×", delegate { SetScale(chosen); }, scale == n));
            }
            menu.Items.Add(size);
            menu.Items.Add(Item(Text.T("Geistmodus (durchklickbar)", "Ghost mode (click-through)"), delegate { Out.Command("ghost", isGhost ? "off" : "on"); }, isGhost));
            menu.Items.Add(new Separator());
            menu.Items.Add(Item(Text.T("Test", "Test"), delegate { Out.Command("test", null); }, false));
            menu.Items.Add(Item(Text.T("Über", "About"), delegate { ShowAbout(); }, false));
            menu.Items.Add(Item(Text.T("Ausblenden", "Hide"), delegate { Out.Command("quit", null); }, false));
            return menu;
        }

        private static MenuItem Item(string header, RoutedEventHandler onClick, bool isChecked)
        {
            MenuItem item = new MenuItem();
            item.Header = header;
            item.IsChecked = isChecked;
            item.Click += onClick;
            return item;
        }

        private void CreateTray()
        {
            try
            {
                tray = new Forms.NotifyIcon();
                tray.Text = name;
                tray.Icon = Drawing.SystemIcons.Application;
                tray.Visible = true;
                tray.MouseClick += delegate(object sender, Forms.MouseEventArgs e)
                {
                    if (e.Button == Forms.MouseButtons.Left) avatar.Dispatcher.BeginInvoke(new Action(ToggleLocalHide));
                };
                Forms.ContextMenuStrip strip = new Forms.ContextMenuStrip();
                strip.Items.Add("\u2026");
                strip.Opening += delegate(object sender, System.ComponentModel.CancelEventArgs e)
                {
                    BuildTrayMenu(strip);
                    e.Cancel = false;
                };
                tray.ContextMenuStrip = strip;
            }
            catch (Exception error)
            {
                tray = null;
                Out.Log("tray: " + error.Message);
            }
        }

        private void BuildTrayMenu(Forms.ContextMenuStrip strip)
        {
            strip.Items.Clear();
            strip.Items.Add(TrayItem(isLocallyHidden ? Text.T("Zeigen", "Show") : Text.T("Verstecken", "Hide"), false, delegate { ToggleLocalHide(); }));
            strip.Items.Add(TrayItem(Text.T("Fragen \u2026", "Ask \u2026"), false, delegate
            {
                if (isLocallyHidden) ToggleLocalHide();
                ToggleInput();
            }));
            strip.Items.Add(TrayItem(Text.T("Status ansagen", "Say status"), false, delegate { Out.Command("status", null); }));
            strip.Items.Add(TrayItem(Text.T("Sitzungen zeigen", "Show sessions"), false, delegate
            {
                if (isLocallyHidden) ToggleLocalHide();
                ShowSessionsOverview(false);
            }));
            strip.Items.Add(TrayItem(Text.T("Geistmodus (durchklickbar)", "Ghost mode (click-through)"), isGhost, delegate { Out.Command("ghost", isGhost ? "off" : "on"); }));
            strip.Items.Add(TrayItem(Text.T("Sprachausgabe", "Speech"), speechEnabled, delegate { Out.Command("speech", null); }));
            strip.Items.Add(new Forms.ToolStripSeparator());
            strip.Items.Add(TrayItem(Text.T("\u00dcber", "About"), false, delegate
            {
                if (isLocallyHidden) ToggleLocalHide();
                ShowAbout();
            }));
            strip.Items.Add(TrayItem(Text.T("Desktop-Avatar beenden", "Close desktop avatar"), false, delegate { Out.Command("quit", null); }));
        }

        private static Forms.ToolStripMenuItem TrayItem(string text, bool isChecked, EventHandler onClick)
        {
            Forms.ToolStripMenuItem item = new Forms.ToolStripMenuItem(text);
            item.Checked = isChecked;
            item.Click += onClick;
            return item;
        }

        // -------------------------------------------------------------- Position

        private void PlaceInitially()
        {
            Rect work = SystemParameters.WorkArea;
            double left = work.Right - 220;
            double top = work.Bottom - 300;
            try
            {
                if (File.Exists(windowPath))
                {
                    Dictionary<string, object> saved = Json.ParseObject(File.ReadAllText(windowPath, Encoding.UTF8));
                    double x = Json.Num(saved, "left", double.NaN);
                    double y = Json.Num(saved, "top", double.NaN);
                    double vl = SystemParameters.VirtualScreenLeft;
                    double vt = SystemParameters.VirtualScreenTop;
                    double vw = SystemParameters.VirtualScreenWidth;
                    double vh = SystemParameters.VirtualScreenHeight;
                    if (!double.IsNaN(x) && !double.IsNaN(y) && x > vl - 100 && x < vl + vw - 60 && y > vt - 100 && y < vt + vh - 60)
                    {
                        left = x;
                        top = y;
                    }
                }
            }
            catch (Exception) { }
            avatar.Left = left;
            avatar.Top = top;
        }

        public void SavePosition()
        {
            try
            {
                Dictionary<string, object> saved = new Dictionary<string, object>();
                saved["left"] = Math.Round(avatar.Left);
                saved["top"] = Math.Round(avatar.Top);
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(windowPath));
                File.WriteAllText(windowPath, Json.Write(saved), new UTF8Encoding(false));
            }
            catch (Exception) { }
        }

        // -------------------------------------------------------------- Ende

        public void Quit(int code)
        {
            ExitCode = code;
            if (pollTimer != null) pollTimer.Stop();
            if (frameTimer != null) frameTimer.Stop();
            if (slowTimer != null) slowTimer.Stop();
            if (bubbleTimer != null) bubbleTimer.Stop();
            app.Shutdown(code);
        }

        public void Dispose()
        {
            try
            {
                if (hotkeyRegistered && avatar != null) Native.UnregisterHotKey(avatar.Handle, HotkeyId);
            }
            catch (Exception) { }
            if (tray != null)
            {
                tray.Visible = false;
                tray.Dispose();
                tray = null;
            }
            if (trayIcon != IntPtr.Zero)
            {
                Native.DestroyIcon(trayIcon);
                trayIcon = IntPtr.Zero;
            }
            if (speaker != null) speaker.Dispose();
            if (avatar != null) SavePosition();
        }
    }

    // ------------------------------------------------------------------ Fenster: Figur

    public sealed class AvatarWindow : Window
    {
        private readonly Companion companion;
        private readonly Image image = new Image();
        private readonly Grid figure = new Grid();
        private readonly DropShadowEffect glow = new DropShadowEffect();
        private readonly TranslateTransform floatShift = new TranslateTransform();
        private readonly Border tickerBox = new Border();
        private readonly TextBlock ticker = new TextBlock();
        private readonly ProgressBar progress = new ProgressBar();
        private readonly Border badge = new Border();
        private readonly TextBlock badgeText = new TextBlock();
        private readonly DispatcherTimer clickTimer = new DispatcherTimer();
        private readonly DispatcherTimer hoverTimer = new DispatcherTimer();
        private string glowMood = "";
        private double dpiScale = 1.0;
        private int shownScale;
        private int bitmapWidth;
        private int bitmapHeight;
        private Point pressAt;
        public IntPtr Handle = IntPtr.Zero;
        public event Action SourceReady;

        public AvatarWindow(Companion companion)
        {
            this.companion = companion;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ShowActivated = false;
            ResizeMode = ResizeMode.NoResize;
            SizeToContent = SizeToContent.WidthAndHeight;
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            Title = "Claude Desktop Avatar";

            RenderOptions.SetBitmapScalingMode(image, BitmapScalingMode.NearestNeighbor);
            image.Stretch = Stretch.Fill;
            image.SnapsToDevicePixels = true;

            glow.ShadowDepth = 0;
            glow.BlurRadius = 14;
            glow.Opacity = 0.6;
            glow.Color = Color.FromRgb(0x00, 0xe5, 0xff);
            figure.Effect = glow;
            figure.RenderTransform = floatShift;
            figure.Children.Add(image);

            badge.CornerRadius = new CornerRadius(8);
            badge.Background = new SolidColorBrush(Color.FromArgb(0xee, 0xff, 0xd2, 0x3f));
            badge.Padding = new Thickness(5, 1, 5, 1);
            badge.HorizontalAlignment = HorizontalAlignment.Left;
            badge.VerticalAlignment = VerticalAlignment.Top;
            badge.Visibility = Visibility.Collapsed;
            badgeText.FontFamily = new FontFamily("Segoe UI");
            badgeText.FontSize = 11;
            badgeText.FontWeight = FontWeights.Bold;
            badgeText.Foreground = new SolidColorBrush(Color.FromRgb(0x1a, 0x12, 0x00));
            badge.Child = badgeText;
            badge.Cursor = Cursors.Hand;
            badge.MouseLeftButtonUp += delegate(object sender, MouseButtonEventArgs e) { e.Handled = true; companion.ShowSessionsOverview(false); };

            ticker.FontFamily = new FontFamily("Cascadia Mono, Consolas, Segoe UI");
            ticker.FontSize = 11;
            ticker.Foreground = new SolidColorBrush(Color.FromRgb(0xd8, 0xf6, 0xff));
            ticker.TextTrimming = TextTrimming.CharacterEllipsis;
            ticker.TextAlignment = TextAlignment.Center;
            progress.Height = 3;
            progress.Minimum = 0;
            progress.Maximum = 1;
            progress.Margin = new Thickness(0, 3, 0, 0);
            progress.BorderThickness = new Thickness(0);
            progress.Background = new SolidColorBrush(Color.FromArgb(0x40, 0xff, 0xff, 0xff));
            progress.Foreground = new SolidColorBrush(Color.FromRgb(0x00, 0xe5, 0xff));
            progress.Visibility = Visibility.Collapsed;
            StackPanel tickerStack = new StackPanel();
            tickerStack.Children.Add(ticker);
            tickerStack.Children.Add(progress);
            tickerBox.Child = tickerStack;
            tickerBox.CornerRadius = new CornerRadius(6);
            tickerBox.Padding = new Thickness(7, 3, 7, 4);
            tickerBox.Background = new SolidColorBrush(Color.FromArgb(0xd8, 0x0e, 0x0b, 0x22));
            tickerBox.BorderThickness = new Thickness(1);
            tickerBox.BorderBrush = new SolidColorBrush(Color.FromArgb(0x90, 0x00, 0xe5, 0xff));
            tickerBox.HorizontalAlignment = HorizontalAlignment.Center;
            tickerBox.Visibility = Visibility.Hidden;

            Grid root = new Grid();
            root.Margin = new Thickness(18, 12, 18, 6);
            root.RowDefinitions.Add(new RowDefinition());
            RowDefinition tickerRow = new RowDefinition();
            tickerRow.Height = new GridLength(34);
            root.RowDefinitions.Add(tickerRow);
            Grid.SetRow(figure, 0);
            Grid.SetRow(badge, 0);
            Grid.SetRow(tickerBox, 1);
            tickerBox.VerticalAlignment = VerticalAlignment.Top;
            tickerBox.Margin = new Thickness(0, 2, 0, 0);
            root.Children.Add(figure);
            root.Children.Add(badge);
            root.Children.Add(tickerBox);
            Content = root;

            DoubleAnimation bob = new DoubleAnimation(0, 3, new Duration(TimeSpan.FromSeconds(2.1)));
            bob.AutoReverse = true;
            bob.RepeatBehavior = RepeatBehavior.Forever;
            bob.EasingFunction = new SineEase();
            floatShift.BeginAnimation(TranslateTransform.YProperty, bob);

            clickTimer.Interval = TimeSpan.FromMilliseconds(Math.Max(200, Forms.SystemInformation.DoubleClickTime));
            clickTimer.Tick += delegate { clickTimer.Stop(); companion.ToggleInput(); };
            hoverTimer.Interval = TimeSpan.FromMilliseconds(700);
            hoverTimer.Tick += delegate { hoverTimer.Stop(); companion.ShowSessionsOverview(true); };

            figure.MouseLeftButtonDown += OnLeftDown;
            figure.MouseRightButtonUp += delegate(object sender, MouseButtonEventArgs e)
            {
                e.Handled = true;
                ContextMenu menu = companion.BuildMenu();
                menu.PlacementTarget = figure;
                menu.Placement = PlacementMode.MousePoint;
                menu.IsOpen = true;
            };
            figure.MouseWheel += delegate(object sender, MouseWheelEventArgs e)
            {
                if ((Keyboard.Modifiers & ModifierKeys.Control) == 0) return;
                e.Handled = true;
                companion.SetScale(companion.Scale + (e.Delta > 0 ? 1 : -1));
            };
            figure.MouseEnter += delegate { hoverTimer.Stop(); hoverTimer.Start(); };
            figure.MouseLeave += delegate { hoverTimer.Stop(); companion.HideHoverBubble(); };

            SizeChanged += OnSizeChanged;
            SourceInitialized += OnSourceInitialized;
        }

        private void OnSourceInitialized(object sender, EventArgs e)
        {
            Handle = new WindowInteropHelper(this).Handle;
            Native.SetExStyle(this, Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE, 0);
            HwndSource source = HwndSource.FromHwnd(Handle);
            if (source != null)
            {
                source.AddHook(WndProc);
                if (source.CompositionTarget != null) dpiScale = source.CompositionTarget.TransformToDevice.M11;
            }
            DpiChanged += delegate(object s, DpiChangedEventArgs args)
            {
                dpiScale = args.NewDpi.DpiScaleX;
                ApplyImageSize();
            };
            ApplyImageSize();
            Action handler = SourceReady;
            if (handler != null) handler();
        }

        private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (msg == Native.WM_HOTKEY)
            {
                companion.OnHotkey(wParam.ToInt32());
                handled = true;
            }
            return IntPtr.Zero;
        }

        private void OnLeftDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount == 2)
            {
                clickTimer.Stop();
                Out.Command("status", null);
                return;
            }
            pressAt = new Point(Left, Top);
            hoverTimer.Stop();
            companion.HideHoverBubble();
            try { DragMove(); } catch (InvalidOperationException) { }
            bool moved = Math.Abs(Left - pressAt.X) > 2 || Math.Abs(Top - pressAt.Y) > 2;
            if (moved)
            {
                SnapToEdges();
                companion.ReportMoved();
            }
            else
            {
                clickTimer.Stop();
                clickTimer.Start();
            }
        }

        private void SnapToEdges()
        {
            Rect work = Screens.WorkAreaOf(this);
            Rect bounds = FigureBounds();
            const double snap = 18;
            if (Math.Abs(bounds.Left - work.Left) < snap) Left += work.Left - bounds.Left;
            if (Math.Abs(work.Right - bounds.Right) < snap) Left += work.Right - bounds.Right;
            if (Math.Abs(work.Bottom - (Top + ActualHeight)) < snap) Top = work.Bottom - ActualHeight;
            if (Math.Abs(bounds.Top - work.Top) < snap) Top += work.Top - bounds.Top;
        }

        private void OnSizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (e.PreviousSize.Width <= 0 || e.PreviousSize.Height <= 0) return;
            // Unten mittig verankert: die Figur wächst nach oben und zu beiden Seiten.
            Left += (e.PreviousSize.Width - e.NewSize.Width) / 2;
            Top += e.PreviousSize.Height - e.NewSize.Height;
        }

        public void ShowBitmap(WriteableBitmap bitmap, int scale)
        {
            if (image.Source != bitmap) image.Source = bitmap;
            if (scale != shownScale || bitmap.PixelWidth != bitmapWidth || bitmap.PixelHeight != bitmapHeight)
            {
                shownScale = scale;
                bitmapWidth = bitmap.PixelWidth;
                bitmapHeight = bitmap.PixelHeight;
                glow.BlurRadius = 4 + scale * 3;
                ApplyImageSize();
            }
        }

        private void ApplyImageSize()
        {
            if (bitmapWidth == 0) return;
            image.Width = bitmapWidth / dpiScale;
            image.Height = bitmapHeight / dpiScale;
            tickerBox.MaxWidth = Math.Max(160, image.Width + 40);
        }

        public Rect FigureBounds()
        {
            try
            {
                Point topLeft = figure.TranslatePoint(new Point(0, 0), this);
                return new Rect(Left + topLeft.X, Top + topLeft.Y, figure.ActualWidth, figure.ActualHeight);
            }
            catch (InvalidOperationException)
            {
                return new Rect(Left, Top, ActualWidth, ActualHeight);
            }
        }

        public void SetTicker(string text, Dictionary<string, object> plan, bool isUrgent)
        {
            if (string.IsNullOrEmpty(text))
            {
                tickerBox.Visibility = Visibility.Hidden;
                return;
            }
            ticker.Text = Text.Clip(text, 70);
            ticker.Foreground = new SolidColorBrush(isUrgent ? Color.FromRgb(0xff, 0xe0, 0x8a) : Color.FromRgb(0xd8, 0xf6, 0xff));
            double total = Json.Num(plan, "total", 0);
            if (total > 0)
            {
                progress.Value = Json.Num(plan, "done", 0) / total;
                progress.Visibility = Visibility.Visible;
            }
            else progress.Visibility = Visibility.Collapsed;
            tickerBox.Visibility = Visibility.Visible;
        }

        public void SetWaiting(int count)
        {
            badge.Visibility = count > 0 ? Visibility.Visible : Visibility.Collapsed;
            badgeText.Text = "◆ " + count;
            badge.ToolTip = Text.T("Sitzungen warten auf dich", "Sessions are waiting for you");
        }

        public void SetMoodGlow(string mood, Color color)
        {
            glow.Color = color;
            progress.Foreground = new SolidColorBrush(color);
            tickerBox.BorderBrush = new SolidColorBrush(Color.FromArgb(0x90, color.R, color.G, color.B));
            if (mood == glowMood) return;
            glowMood = mood;
            if (mood == "attention")
            {
                DoubleAnimation pulse = new DoubleAnimation(0.35, 1.0, new Duration(TimeSpan.FromMilliseconds(650)));
                pulse.AutoReverse = true;
                pulse.RepeatBehavior = RepeatBehavior.Forever;
                glow.BeginAnimation(DropShadowEffect.OpacityProperty, pulse);
            }
            else
            {
                glow.BeginAnimation(DropShadowEffect.OpacityProperty, null);
                glow.Opacity = mood == "sleeping" ? 0.3 : 0.6;
            }
        }

        public void SetGhost(bool isGhost)
        {
            if (Handle == IntPtr.Zero) return;
            if (isGhost) Native.SetExStyle(this, Native.WS_EX_TRANSPARENT | Native.WS_EX_LAYERED, 0);
            else Native.SetExStyle(this, 0, Native.WS_EX_TRANSPARENT);
            Opacity = isGhost ? 0.55 : 1.0;
        }
    }

    // ------------------------------------------------------------------ Fenster: Sprechblase

    public sealed class BubbleWindow : Window
    {
        private readonly Border box = new Border();
        private readonly StackPanel stack = new StackPanel();
        private readonly TextBlock title = new TextBlock();
        private readonly TextBlock body = new TextBlock();
        private readonly System.Windows.Shapes.Polygon tail = new System.Windows.Shapes.Polygon();
        private readonly Grid root = new Grid();
        private readonly DispatcherTimer typer = new DispatcherTimer();
        private string fullText = "";
        private int shown;
        public event Action Dismissed;

        public BubbleWindow()
        {
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ShowActivated = false;
            ResizeMode = ResizeMode.NoResize;
            SizeToContent = SizeToContent.WidthAndHeight;
            Title = "Claude Desktop Avatar";
            MaxWidth = 340;

            title.FontFamily = new FontFamily("Segoe UI Semibold, Segoe UI");
            title.FontSize = 11;
            title.Foreground = new SolidColorBrush(Color.FromRgb(0xff, 0x6a, 0xe6));
            title.Margin = new Thickness(0, 0, 0, 2);
            body.FontFamily = new FontFamily("Segoe UI");
            body.FontSize = 13;
            body.TextWrapping = TextWrapping.Wrap;
            body.Foreground = new SolidColorBrush(Color.FromRgb(0xe8, 0xf7, 0xff));
            stack.Children.Add(title);
            stack.Children.Add(body);
            box.Child = stack;
            box.CornerRadius = new CornerRadius(10);
            box.Padding = new Thickness(11, 7, 11, 9);
            box.Background = new SolidColorBrush(Color.FromArgb(0xec, 0x10, 0x0d, 0x24));
            box.BorderThickness = new Thickness(1.5);
            DropShadowEffect shadow = new DropShadowEffect();
            shadow.ShadowDepth = 0;
            shadow.BlurRadius = 10;
            shadow.Opacity = 0.55;
            box.Effect = shadow;

            tail.Points = new PointCollection(new Point[] { new Point(0, 0), new Point(14, 0), new Point(7, 8) });
            tail.Fill = box.Background;
            tail.HorizontalAlignment = HorizontalAlignment.Left;
            root.Margin = new Thickness(8);
            root.Children.Add(box);
            root.Children.Add(tail);
            Content = root;

            typer.Interval = TimeSpan.FromMilliseconds(16);
            typer.Tick += delegate
            {
                shown = Math.Min(fullText.Length, shown + 2);
                body.Text = fullText.Substring(0, shown);
                if (shown >= fullText.Length) typer.Stop();
            };
            MouseLeftButtonUp += delegate
            {
                if (shown < fullText.Length)
                {
                    shown = fullText.Length;
                    body.Text = fullText;
                    typer.Stop();
                    return;
                }
                Action handler = Dismissed;
                if (handler != null) handler();
            };
            SourceInitialized += delegate { Native.SetExStyle(this, Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE, 0); };
        }

        public void SetContent(string heading, List<string> lines, bool isUrgent, Color accent, bool animate)
        {
            title.Text = heading;
            title.Foreground = new SolidColorBrush(isUrgent ? Color.FromRgb(0xff, 0xd2, 0x3f) : Color.FromRgb(0xff, 0x6a, 0xe6));
            box.BorderBrush = new SolidColorBrush(Color.FromArgb(0xd0, accent.R, accent.G, accent.B));
            ((DropShadowEffect)box.Effect).Color = accent;
            fullText = string.Join("\n", lines.Take(4).Select(line => Text.Clip(line, 160)));
            if (animate && !System.Windows.SystemParameters.ClientAreaAnimation) animate = false;
            box.Width = double.NaN;
            box.Height = double.NaN;
            if (animate)
            {
                body.Text = fullText;
                box.Measure(new Size(MaxWidth - 16, double.PositiveInfinity));
                box.Width = Math.Ceiling(box.DesiredSize.Width);
                box.Height = Math.Ceiling(box.DesiredSize.Height);
                shown = 0;
                body.Text = "";
                typer.Start();
            }
            else
            {
                typer.Stop();
                shown = fullText.Length;
                body.Text = fullText;
            }
        }

        public void SetTail(double x, bool pointsUp)
        {
            double offset = Math.Max(14, Math.Min(ActualWidth - 30, x - 8 - 7));
            tail.Margin = new Thickness(offset, 0, 0, 0);
            if (pointsUp)
            {
                tail.Points = new PointCollection(new Point[] { new Point(0, 8), new Point(14, 8), new Point(7, 0) });
                tail.VerticalAlignment = VerticalAlignment.Top;
                tail.RenderTransform = new TranslateTransform(0, -7);
            }
            else
            {
                tail.Points = new PointCollection(new Point[] { new Point(0, 0), new Point(14, 0), new Point(7, 8) });
                tail.VerticalAlignment = VerticalAlignment.Bottom;
                tail.RenderTransform = new TranslateTransform(0, 7);
            }
        }
    }

    // ------------------------------------------------------------------ Fenster: Schnelleingabe

    public sealed class InputWindow : Window
    {
        private readonly Companion companion;
        private readonly TextBox box = new TextBox();
        private readonly TextBlock hint = new TextBlock();
        private readonly ComboBox target = new ComboBox();
        private readonly Button mic = new Button();
        private readonly Button send = new Button();
        private readonly List<string> history = new List<string>();
        private int historyIndex = -1;
        private DateTime micUsedAt = DateTime.MinValue;
        private List<Dictionary<string, object>> sessions = new List<Dictionary<string, object>>();

        public InputWindow(Companion companion)
        {
            this.companion = companion;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ResizeMode = ResizeMode.NoResize;
            SizeToContent = SizeToContent.Height;
            Width = 380;
            Title = "Claude Desktop Avatar";

            Brush fg = new SolidColorBrush(Color.FromRgb(0xe8, 0xf7, 0xff));
            Brush field = new SolidColorBrush(Color.FromArgb(0xff, 0x1a, 0x16, 0x38));
            box.FontFamily = new FontFamily("Segoe UI");
            box.FontSize = 14;
            box.Foreground = fg;
            box.CaretBrush = new SolidColorBrush(Color.FromRgb(0x00, 0xe5, 0xff));
            box.Background = field;
            box.BorderThickness = new Thickness(0);
            box.Padding = new Thickness(6, 5, 6, 5);
            box.AcceptsReturn = false;
            box.TextWrapping = TextWrapping.Wrap;
            box.MaxHeight = 120;
            box.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            hint.FontFamily = box.FontFamily;
            hint.FontSize = 13;
            hint.Foreground = new SolidColorBrush(Color.FromArgb(0x90, 0xe8, 0xf7, 0xff));
            hint.Margin = new Thickness(9, 6, 0, 0);
            hint.IsHitTestVisible = false;
            Grid field2 = new Grid();
            field2.Children.Add(box);
            field2.Children.Add(hint);

            target.MinWidth = 90;
            target.Margin = new Thickness(0, 0, 6, 0);
            target.VerticalContentAlignment = VerticalAlignment.Center;
            target.Visibility = Visibility.Collapsed;

            mic.Content = "\U0001F3A4";
            mic.Width = 30;
            mic.Margin = new Thickness(6, 0, 0, 0);
            mic.Click += delegate
            {
                micUsedAt = DateTime.UtcNow;
                box.Focus();
                Keyboard.Focus(box);
                Dispatcher.BeginInvoke(DispatcherPriority.Input, new Action(Native.StartDictation));
            };
            send.Content = "➤";
            send.Width = 30;
            send.Margin = new Thickness(6, 0, 0, 0);
            send.Click += delegate { Submit(); };
            StyleButton(mic);
            StyleButton(send);

            Grid row = new Grid();
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(target, 0);
            Grid.SetColumn(field2, 1);
            Grid.SetColumn(mic, 2);
            Grid.SetColumn(send, 3);
            row.Children.Add(target);
            row.Children.Add(field2);
            row.Children.Add(mic);
            row.Children.Add(send);

            Border frame = new Border();
            frame.Child = row;
            frame.CornerRadius = new CornerRadius(10);
            frame.Padding = new Thickness(8);
            frame.Margin = new Thickness(8);
            frame.Background = new SolidColorBrush(Color.FromArgb(0xf2, 0x10, 0x0d, 0x24));
            frame.BorderThickness = new Thickness(1.5);
            frame.BorderBrush = new SolidColorBrush(Color.FromRgb(0x00, 0xe5, 0xff));
            DropShadowEffect shadow = new DropShadowEffect();
            shadow.ShadowDepth = 0;
            shadow.BlurRadius = 12;
            shadow.Opacity = 0.6;
            shadow.Color = Color.FromRgb(0x00, 0xe5, 0xff);
            frame.Effect = shadow;
            Content = frame;

            box.TextChanged += delegate { hint.Visibility = box.Text.Length == 0 ? Visibility.Visible : Visibility.Collapsed; };
            box.PreviewKeyDown += OnKey;
            Deactivated += delegate
            {
                if (box.Text.Trim().Length == 0 && (DateTime.UtcNow - micUsedAt).TotalSeconds > 30) Hide();
            };
        }

        private static void StyleButton(Button button)
        {
            button.Background = new SolidColorBrush(Color.FromArgb(0xff, 0x22, 0x1d, 0x4a));
            button.Foreground = new SolidColorBrush(Color.FromRgb(0x00, 0xe5, 0xff));
            button.BorderThickness = new Thickness(0);
            button.FontSize = 14;
            button.Cursor = Cursors.Hand;
        }

        public void SetSessions(List<Dictionary<string, object>> list)
        {
            string selected = SelectedSession();
            sessions = list;
            target.Items.Clear();
            int selectIndex = 0;
            for (int i = 0; i < list.Count; i++)
            {
                Dictionary<string, object> session = list[i];
                string label = Json.Str(session, "project", "?");
                if (Json.Bool(session, "needsYou", false)) label = "◆ " + label;
                target.Items.Add(label);
                string id = Json.Str(session, "id", "");
                if (selected != null ? id == selected : Json.Bool(session, "isSelf", false)) selectIndex = i;
            }
            target.Visibility = list.Count > 1 ? Visibility.Visible : Visibility.Collapsed;
            if (list.Count > 0) target.SelectedIndex = selectIndex;
        }

        private string SelectedSession()
        {
            int index = target.SelectedIndex;
            if (index < 0 || index >= sessions.Count) return null;
            return Json.Str(sessions[index], "id", null);
        }

        public void Open(Window anchor, string name)
        {
            hint.Text = Text.T("Frag " + name + " …  (Enter senden, Esc schließen)", "Ask " + name + " …  (Enter to send, Esc to close)");
            mic.ToolTip = Text.T("Diktieren (Windows-Diktat, Win+H)", "Dictate (Windows voice typing, Win+H)");
            send.ToolTip = Text.T("Senden", "Send");
            target.ToolTip = Text.T("An welche Sitzung (Tab wechselt)", "Which session (Tab switches)");
            hint.Visibility = box.Text.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
            Show();
            Follow(anchor);
            Activate();
            box.Focus();
            Keyboard.Focus(box);
        }

        public void Follow(Window anchor)
        {
            if (!IsVisible || anchor == null) return;
            UpdateLayout();
            Rect work = Screens.WorkAreaOf(anchor);
            double left = anchor.Left + anchor.ActualWidth / 2 - ActualWidth / 2;
            double top = anchor.Top + anchor.ActualHeight - 4;
            if (top + ActualHeight > work.Bottom) top = anchor.Top - ActualHeight + 8;
            Left = Math.Max(work.Left + 4, Math.Min(work.Right - ActualWidth - 4, left));
            Top = Math.Max(work.Top + 4, Math.Min(work.Bottom - ActualHeight - 4, top));
        }

        private void OnKey(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && (Keyboard.Modifiers & ModifierKeys.Shift) == 0)
            {
                e.Handled = true;
                Submit();
            }
            else if (e.Key == Key.Escape)
            {
                e.Handled = true;
                Hide();
            }
            else if (e.Key == Key.Tab && sessions.Count > 1)
            {
                e.Handled = true;
                target.SelectedIndex = (target.SelectedIndex + 1) % sessions.Count;
            }
            else if (e.Key == Key.Up && history.Count > 0 && (box.Text.Length == 0 || historyIndex >= 0))
            {
                e.Handled = true;
                historyIndex = historyIndex < 0 ? history.Count - 1 : Math.Max(0, historyIndex - 1);
                box.Text = history[historyIndex];
                box.CaretIndex = box.Text.Length;
            }
            else if (e.Key == Key.Down && historyIndex >= 0)
            {
                e.Handled = true;
                historyIndex++;
                if (historyIndex >= history.Count)
                {
                    historyIndex = -1;
                    box.Text = "";
                }
                else box.Text = history[historyIndex];
                box.CaretIndex = box.Text.Length;
            }
        }

        private void Submit()
        {
            string text = box.Text.Trim();
            if (text.Length == 0) return;
            history.Add(text);
            if (history.Count > 20) history.RemoveAt(0);
            historyIndex = -1;
            box.Text = "";
            string session = SelectedSession();
            bool isSelf = session == null || sessions.Any(s => Json.Str(s, "id", "") == session && Json.Bool(s, "isSelf", false));
            companion.SendPrompt(text, isSelf ? null : session);
            Hide();
        }
    }
}
