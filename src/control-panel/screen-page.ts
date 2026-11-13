import { FACE_STYLES, FaceStyle } from '../face/ambient.service';
import { SCENES } from '../face/scenes';
/** The "Screen" section of the Settings tab: what the round screen shows when Empathika is idle, and the evening photo frame. */
export interface PanelScreen {
  glance: boolean;
  frame: boolean;
  frameFrom: string;
  frameTo: string;
  frameEverySec: number;
  captions: boolean;
  face: FaceStyle;
  /** 'none', a built-in scene, or 'custom'; and whether a picture of your own has been uploaded. */
  background: string;
  hasCustomBackground: boolean;
  /** Dim the screen after this many quiet seconds (0 = never), down to this brightness (%). */
  dimAfterSec: number;
  dimLevel: number;
  photos: { name: string; size: number }[];
  /** The home location's name (the weather is for it), if set. */
  place?: string;
}

type Esc = (s: unknown) => string;

export const SCREEN_CSS = `
.photos { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
.photos figure { margin: 0; position: relative; }
.photos img { width: 96px; height: 96px; object-fit: cover; border-radius: 10px; display: block; background: #0002; }
.photos form { position: absolute; top: 4px; right: 4px; }
.photos button { border: 0; border-radius: 99px; width: 26px; height: 26px; background: #000a; color: #fff; font-size: 14px; cursor: pointer; }
label.tick { display: block; margin: 8px 0; }
.scenes { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0 4px; }
.scenes label { display: block; text-align: center; font-size: 12px; color: var(--muted); cursor: pointer; }
.scenes img, .scenes .none { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; display: block; border: 3px solid transparent; background: #15111f; }
.scenes input { position: absolute; opacity: 0; }
.scenes input:checked + img, .scenes input:checked + .none { border-color: var(--accent); }
.upload { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
`;

export function screenSection(s: PanelScreen, esc: Esc): string {
  const photos = s.photos
    .map(
      (p) => `<figure><img src="/screen/photos/${esc(p.name)}" loading="lazy" alt=""><form method="post" action="/screen/photo-delete" onsubmit="return confirm('Remove this picture?')"><input type="hidden" name="name" value="${esc(p.name)}"><button type="submit" title="Remove" aria-label="Remove">✕</button></form></figure>`,
    )
    .join('');
  return `<section id="screen"><h2>Screen</h2>
<p class="meta">What Empathika's round screen shows in the resident's room.</p>
<form class="stack" method="post" action="/screen/save">
<div class="addfact"><label class="meta" for="faceSel"><b>Face</b></label><select id="faceSel" name="face">${(Object.keys(FACE_STYLES) as FaceStyle[]).map((k) => `<option value="${k}" ${s.face === k ? 'selected' : ''}>${esc(FACE_STYLES[k])}</option>`).join('')}</select></div>
<p class="meta" style="margin:10px 0 0"><b>Background</b> behind the 3D nurse (a still picture: no extra work for the box). It is dimmed a little so the clock stays readable, and much more behind a card and at night.</p>
<div class="scenes">
<label><input type="radio" name="background" value="none" ${s.background === 'none' || (s.background === 'custom' && !s.hasCustomBackground) ? 'checked' : ''}><span class="none"></span>Plain dark</label>
${Object.entries(SCENES).map(([k, sc]) => `<label><input type="radio" name="background" value="${k}" ${s.background === k ? 'checked' : ''}><img src="/screen/scene/${k}.svg" alt="" loading="lazy">${esc(sc.label.split(':')[0])}</label>`).join('')}
${s.hasCustomBackground ? `<label><input type="radio" name="background" value="custom" ${s.background === 'custom' ? 'checked' : ''}><img src="/screen/background" alt="" loading="lazy">Your own</label>` : ''}
</div>
<label class="meta tick"><input type="checkbox" name="captions" value="on" ${s.captions ? 'checked' : ''}> <b>Captions</b>: show the words on screen, what Empathika heard and what she's answering (helpful for residents who are hard of hearing)</label>
<label class="meta tick"><input type="checkbox" name="glance" value="on" ${s.glance ? 'checked' : ''}> <b>Glance</b>: the weather${s.place ? ` in ${esc(s.place)}` : ' (set the care home location above)'} and the next reminder, around her face</label>
<label class="meta tick"><input type="checkbox" name="frame" value="on" ${s.frame ? 'checked' : ''}> <b>Evening photo frame</b>: the resident's pictures (family, places, memories), one fading into the next, with the clock (after 2 minutes of quiet; "Hey Empathika" or a touch brings her back)</label>
<div class="addfact"><label class="meta" for="dimA">Dim the screen after</label><input id="dimA" type="number" name="dimAfterSec" min="0" max="3600" value="${s.dimAfterSec}" style="width:5em"><span class="meta">seconds of quiet (0 = never), down to</span><input type="number" name="dimLevel" min="5" max="80" value="${s.dimLevel}" style="width:4.5em" aria-label="Dimmed brightness"><span class="meta">% (it lights up again for "Hey Empathika", a card, a timer or a touch)</span></div>
<div class="addfact"><label class="meta" for="ff">From</label><input id="ff" type="time" name="frameFrom" value="${esc(s.frameFrom)}" required>
<label class="meta" for="ft">to</label><input id="ft" type="time" name="frameTo" value="${esc(s.frameTo)}" required>
<label class="meta" for="fe">next picture every</label><input id="fe" type="number" name="frameEverySec" min="5" max="600" value="${s.frameEverySec}" style="width:5em"><span class="meta">seconds</span></div>
<div><button class="btn" type="submit">Save</button></div>
</form>
<h3>Your own background</h3>
<div class="upload"><input id="bgFile" type="file" accept="image/jpeg,image/png,image/webp"><span class="meta" id="bgMsg">A picture of your own for behind the nurse (the garden at home, a favourite view): JPEG, PNG or WebP, up to 15 MB. It becomes the background straight away.</span></div>
<script>
(function () {
  var input = document.getElementById('bgFile'), msg = document.getElementById('bgMsg');
  input.addEventListener('change', async function () {
    if (!input.files[0]) return;
    msg.textContent = 'Uploading…';
    try {
      var r = await fetch('/screen/background', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: input.files[0] });
      var j = await r.json();
      if (j.error) { msg.textContent = j.error; return; }
      location.hash = 'screen'; location.reload();
    } catch (e) { msg.textContent = 'The upload failed.'; }
  });
})();
</script>
<h3>Pictures (${s.photos.length})</h3>
<div class="photos">${photos || '<p class="meta">No pictures yet.</p>'}</div>
<div class="upload"><input id="photoFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple><span class="meta" id="photoMsg">JPEG, PNG or WebP, up to 15 MB each. Kept on the box only.</span></div>
<script>
(function () {
  var input = document.getElementById('photoFiles'), msg = document.getElementById('photoMsg');
  input.addEventListener('change', async function () {
    var files = Array.prototype.slice.call(input.files), done = 0, failed = [];
    for (var i = 0; i < files.length; i++) {
      msg.textContent = 'Uploading ' + (i + 1) + ' of ' + files.length + '…';
      try {
        var r = await fetch('/screen/photo', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: files[i] });
        var j = await r.json();
        if (j.error) failed.push(files[i].name + ': ' + j.error); else done++;
      } catch (e) { failed.push(files[i].name + ': upload failed'); }
    }
    if (failed.length) { msg.textContent = failed.join(' · '); if (done) setTimeout(function () { location.hash = 'screen'; location.reload(); }, 2500); }
    else { location.hash = 'screen'; location.reload(); }
  });
})();
</script>
</section>`;
}
