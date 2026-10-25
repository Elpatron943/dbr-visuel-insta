const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const api = async (p, o) => { const r = await fetch(p, o); if (r.status === 401) { location.href = "/"; throw new Error("non connecté"); } const j = await r.json(); if (j.error) throw new Error(j.error); return j; };
let rules = [], media = [], current = null;
const ruleFor = (id) => rules.find((r) => String(r.media_id) === String(id));
const fallbackRule = () => rules[rules.length - 1] || null;

async function load() {
  try {
    const me = await api("/api/me"); const p = me.profile; media = me.media;
    $("profile").innerHTML = `<div class="profile"><img src="${esc(p.profile_picture_url)}" alt=""><div><b>@${esc(p.username)}</b><br><span class="muted">${esc(p.name || "")}</span></div></div>
      <div class="stats"><div><b>${p.followers_count ?? "-"}</b>abonnés</div><div><b>${p.media_count ?? "-"}</b>publications</div><div><b>${esc(p.account_type || "")}</b>type</div></div>`;
  } catch (e) { $("profile").innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  try { rules = (await api("/api/rules")).rules; } catch { rules = []; }
  $("rules").innerHTML = rules.length ? rules.map((r) => `<div class="c"><div><span class="kw">${esc(r.keyword)}</span><br><small>${esc(r.guide_title)}</small></div><a class="btn ghost small" href="${esc(r.guide_url)}" target="_blank">Guide</a></div>`).join("") : "Aucune règle active pour l'instant.";
  $("media").innerHTML = media.map((m) => { const r = ruleFor(m.id); return `<button class="m" data-id="${m.id}"><img src="${esc(m.thumbnail_url || m.media_url)}" alt=""><div>${r ? `<span class="kw">${esc(r.keyword)}</span> ` : ""}${m.comments_count ?? 0} commentaire(s)</div></button>`; }).join("") || '<span class="muted">Aucune publication.</span>';
  document.querySelectorAll(".m").forEach((b) => b.onclick = () => openMedia(b.dataset.id));
  loadConvs();
}

async function openMedia(id) {
  current = media.find((m) => m.id === id);
  document.querySelectorAll(".m").forEach((b) => b.classList.toggle("sel", b.dataset.id === id));
  const r = ruleFor(id) || fallbackRule();
  $("ctitle").innerHTML = `Commentaires ${r ? `· mot-clé <span class="kw">${esc(r.keyword)}</span>` : ""}`;
  $("comments").textContent = "Chargement…";
  try {
    const { comments } = await api(`/api/comments?media=${id}`);
    if (!comments.length) { $("comments").textContent = "Aucun commentaire."; return; }
    $("comments").innerHTML = comments.map((c) => {
      const hit = r && norm(c.text).split(/[^A-Z0-9]+/).includes(norm(r.keyword));
      return `<div class="c ${hit ? "match" : ""}"><div><b>@${esc(c.username || c.from?.username)}</b> <small>${new Date(c.timestamp).toLocaleString("fr-FR")}</small><br>${esc(c.text)}</div>
        ${r ? `<button class="btn small" data-c="${c.id}">${hit ? "Envoyer le guide" : "Envoyer quand même"}</button>` : ""}</div>`;
    }).join("");
    document.querySelectorAll("[data-c]").forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = "Envoi…";
      try { const res = await api("/api/send-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment_id: b.dataset.c, guide_title: r.guide_title, guide_url: r.guide_url }) }); b.outerHTML = `<span class="status ok">Réponse privée envoyée${res.publicReply ? " + réponse publique" : ""}</span>`; loadConvs(); }
      catch (e) { b.outerHTML = `<span class="status err">${esc(e.message)}</span>`; }
    });
  } catch (e) { $("comments").innerHTML = `<span class="err">${esc(e.message)}</span>`; }
}

async function loadConvs() {
  try {
    const { conversations } = await api("/api/conversations");
    const r = fallbackRule();
    $("convs").innerHTML = conversations.length ? conversations.map((c) => `<div class="c"><div><b>@${esc(c.username || c.user_id)}</b> <small>${new Date(c.updated_time).toLocaleString("fr-FR")}</small><br>
      ${c.messages.map((m) => `<small>${m.mine ? "Vous" : "Lui/elle"} :</small> ${esc((m.text || "").slice(0, 120))}`).join("<br>")}</div>
      ${r && c.user_id ? `<button class="btn small" data-u="${c.user_id}">Vérifier l'abonnement et envoyer le lien</button>` : ""}</div>`).join("") : "Aucune conversation.";
    document.querySelectorAll("[data-u]").forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = "Vérification…";
      try { const res = await api("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: b.dataset.u, guide_title: r.guide_title, guide_url: r.guide_url }) }); b.outerHTML = `<span class="status ${res.follows ? "ok" : ""}">${res.follows ? "Abonné(e) : lien du guide envoyé" : "Pas encore abonné(e) : rappel envoyé"}</span>`; }
      catch (e) { b.outerHTML = `<span class="status err">${esc(e.message)}</span>`; }
    });
  } catch (e) { $("convs").innerHTML = `<span class="err">${esc(e.message)}</span>`; }
}
load();
