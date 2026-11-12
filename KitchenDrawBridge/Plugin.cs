// SCN Viewer v1 - KitchenDraw SDK2 integration.
// Build on the machine where a legitimate KitchenDraw SDK2 assembly is installed.
// The plugin runs in KitchenDraw's UI thread; the local web server only writes input files.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using KD.SDK2;

namespace KitchenDrawBridge
{
    public class Plugin
    {
        private readonly Appli _app;
        private Timer _timer;
        private bool _busy;
        private readonly string _root;
        private readonly string _queue;

        public Plugin()
        {
            _app = new Appli();
            _root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ScnViewerBridge");
            _queue = Path.Combine(_root, "queue");
        }

        public bool OnPluginLoad(int unused)
        {
            Directory.CreateDirectory(_queue);
            _timer = new Timer();
            _timer.Interval = 750;
            _timer.Tick += OnTimerTick;
            _timer.Start();
            return true;
        }

        public bool OnPluginUnload(int unused)
        {
            if (_timer != null)
            {
                _timer.Stop();
                _timer.Tick -= OnTimerTick;
                _timer.Dispose();
                _timer = null;
            }
            try { File.Delete(Path.Combine(_root, "heartbeat")); } catch { }
            return true;
        }

        private void OnTimerTick(object sender, EventArgs e)
        {
            if (_busy) return;
            _busy = true;
            try
            {
                // The server indicates plugin presence via heartbeat modified-time only.
                File.WriteAllText(Path.Combine(_root, "heartbeat"), DateTime.UtcNow.ToString("o"));
                string[] jobs = Directory.GetFiles(_queue, "*.pending");
                if (jobs.Length == 0) return;
                Array.Sort(jobs, StringComparer.Ordinal);
                ProcessJob(jobs[0]);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("SCN Viewer bridge: " + ex);
            }
            finally { _busy = false; }
        }

        private void ProcessJob(string pending)
        {
            string prefix = pending.Substring(0, pending.Length - ".pending".Length);
            string working = prefix + ".working";
            try { File.Move(pending, working); }
            catch (IOException) { return; } // picked up by another running instance

            try
            {
                string scn = prefix + ".scn";
                string obj = prefix + ".obj";
                if (!File.Exists(scn)) throw new IOException("A feltöltött SCN fájl hiányzik.");

                Scene scene = _app.Scene;
                // Never discard unsaved work in the user's KitchenDraw session.
                if (scene.IsLoaded && scene.IsModified)
                    throw new InvalidOperationException("A KitchenDraw-ban nem mentett terv van megnyitva. Mentse el vagy zárja be a tervet, majd nyissa meg újra az SCN-t a Viewerben.");
                if (scene.IsLoaded) scene.Close(false);

                // Official SDK method reads the original KitchenDraw scene and catalog references.
                scene.Load(scn);
                scene.Export3dGeometry(obj, false, false, false, false);
                if (!File.Exists(obj) || new FileInfo(obj).Length == 0)
                    throw new IOException("A KitchenDraw nem készített OBJ 3D modellt. Ellenőrizze, hogy a szükséges katalógusok telepítve vannak-e.");

                // Preserve authoritative dimensions from scene, independently of the OBJ mesh.
                // They are listed separately in the viewer: no ungrounded mesh-to-cabinet matching.
                try { WriteManifest(scene, prefix + ".manifest.json"); }
                catch (Exception metaErr)
                {
                    System.Diagnostics.Debug.WriteLine("SCN Viewer metadata warning: " + metaErr.Message);
                    // Geometry export is still useful when some object metadata cannot be read.
                }
                File.WriteAllText(prefix + ".done", "ok", new UTF8Encoding(false));
            }
            catch (Exception ex)
            {
                File.WriteAllText(prefix + ".error.txt", ex.Message, new UTF8Encoding(false));
            }
            finally
            {
                try { File.Delete(working); } catch { }
            }
        }

        private void WriteManifest(Scene scene, string filename)
        {
            var entries = new List<Dictionary<string, object>>();
            foreach (Scene.Object obj in scene.Objects)
            {
                try
                {
                    if (obj.IsHidden || !obj.IsGraphic || obj.IsWallObject) continue;
                    var item = new Dictionary<string, object>();
                    item["name"] = obj.Name;
                    item["reference"] = obj.Reference;
                    item["id"] = obj.Id;
                    item["isPart"] = obj.IsPartComponent || obj.IsCarcasePanelComponent || obj.IsFrontPanelComponent;
                    item["widthMm"] = Appli.UnitConvert(obj.Unit, Appli.UnitType.Mm, obj.DimensionX);
                    item["depthMm"] = Appli.UnitConvert(obj.Unit, Appli.UnitType.Mm, obj.DimensionY);
                    item["heightMm"] = Appli.UnitConvert(obj.Unit, Appli.UnitType.Mm, obj.DimensionZ);
                    entries.Add(item);
                }
                catch (Exception) { /* individual unavailable catalog entries must not abort export */ }
            }
            var result = new Dictionary<string, object>();
            result["source"] = "KitchenDraw SDK2";
            result["sceneName"] = scene.Name;
            result["sceneUnit"] = scene.Unit.ToString();
            result["objects"] = entries;
            File.WriteAllText(filename, new JavaScriptSerializer().Serialize(result), new UTF8Encoding(false));
        }
    }
}
