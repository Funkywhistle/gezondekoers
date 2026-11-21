// Inloggen en synchroniseren met Appwrite. Gebruikt S, LS, save() en render() uit index.html.
(function () {
  var C = window.GK_CONFIG, A = window.Appwrite;
  if (!C || !A) return;
  var client = new A.Client().setEndpoint(C.endpoint).setProject(C.project);
  var account = new A.Account(client), tdb = new A.TablesDB(client);
  var FLAG = "gk-eerder-ingelogd", uid = null, busy = false, pending = false;
  var ids = { databaseId: C.database, tableId: C.table };

  function flag(v) { try { if (v) localStorage.setItem(FLAG, "1"); else localStorage.removeItem(FLAG); } catch (e) {} }
  function had() { try { return localStorage.getItem(FLAG) === "1"; } catch (e) { return false; } }
  function setSt(t) { GK.st = t; var e = document.getElementById("gks"); if (e) e.textContent = t; }
  function hasData(o) { return !!(o && o.days && (Object.keys(o.days).length || (o.goal && o.goal.start))); }

  function pull() {
    return tdb.getRow({ databaseId: ids.databaseId, tableId: ids.tableId, rowId: uid })
      .then(function (r) { return JSON.parse(r.data); })
      .catch(function (e) { if (e && e.code === 404) return null; throw e; });
  }
  function push(o) {
    var data = { data: JSON.stringify(o), updated: o.u || Date.now() };
    return tdb.updateRow({ databaseId: ids.databaseId, tableId: ids.tableId, rowId: uid, data: data })
      .catch(function (e) {
        if (!e || e.code !== 404) throw e;
        var p = [A.Permission.read(A.Role.user(uid)), A.Permission.update(A.Role.user(uid)), A.Permission.delete(A.Role.user(uid))];
        return tdb.createRow({ databaseId: ids.databaseId, tableId: ids.tableId, rowId: uid, data: data, permissions: p });
      });
  }

  dbDoc = {
    set: function (o) {
      if (!uid) return Promise.resolve();
      setSt("Opslaan…");
      return push(o).then(function () { pending = false; setSt("✓ Gesynchroniseerd"); })
        .catch(function (e) { pending = true; setSt("Nog niet gesynchroniseerd (offline?). We proberen het later opnieuw."); throw e; });
    }
  };

  function sync() {
    if (!uid || busy) return Promise.resolve();
    busy = true;
    return pull().then(function (r) {
      if (r && r.days && (r.u || 0) > (S.u || 0)) {
        S = r; try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {}
        render(); setSt("✓ Gesynchroniseerd");
      } else if (hasData(S) && (!r || (S.u || 0) > (r.u || 0))) {
        return push(S).then(function () { setSt("✓ Gesynchroniseerd"); });
      } else setSt("✓ Gesynchroniseerd");
    }).catch(function () { setSt("Offline. Je gegevens staan veilig op dit apparaat."); })
      .then(function () { busy = false; });
  }

  function msg(e) {
    var c = e && e.code;
    if (c === 401) return "E-mailadres of wachtwoord klopt niet.";
    if (c === 409) return "Er bestaat al een account met dit e-mailadres. Kies Inloggen.";
    if (c === 400) return "Controleer je e-mailadres en kies een wachtwoord van minimaal 8 tekens.";
    if (c === 429) return "Te veel pogingen. Wacht even en probeer het opnieuw.";
    return "Dat lukte niet. Controleer je internetverbinding.";
  }

  function showLogin() {
    if (document.getElementById("gl")) return;
    var d = document.createElement("div"); d.id = "gl";
    d.innerHTML = '<div class="card"><h1>Mijn gezonde koers</h1><p class="sub">Log in om je gegevens op al je apparaten te zien.</p>' +
      '<label for="gle">E-mailadres</label><input id="gle" type="email" autocomplete="username" inputmode="email">' +
      '<label for="glp">Wachtwoord</label><input id="glp" type="password" autocomplete="current-password">' +
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn pri" id="gli" style="flex:1">Inloggen</button><button class="btn" id="glc" style="flex:1">Account maken</button></div>' +
      '<small id="glm" style="display:block;margin-top:10px"></small></div>';
    document.body.appendChild(d);
    function go(create) {
      var em = document.getElementById("gle").value.trim(), pw = document.getElementById("glp").value, m = document.getElementById("glm");
      if (!em || !pw) { m.textContent = "Vul je e-mailadres en wachtwoord in."; return; }
      m.textContent = "Bezig…";
      var p = create ? account.create({ userId: A.ID.unique(), email: em, password: pw }) : Promise.resolve();
      p.then(function () { return account.createEmailPasswordSession({ email: em, password: pw }); })
        .then(function () { return account.get(); })
        .then(function (u) { uid = u.$id; GK.mail = u.email; flag(true); d.remove(); render(); return sync(); })
        .catch(function (e) { m.textContent = msg(e); });
    }
    document.getElementById("gli").onclick = function () { go(false); };
    document.getElementById("glc").onclick = function () { go(true); };
    document.getElementById("glp").addEventListener("keydown", function (e) { if (e.key === "Enter") go(false); });
  }

  window.gkLogout = function () {
    if (!confirm("Uitloggen? De gegevens op dit apparaat worden gewist. Je gegevens blijven bewaard in je account.")) return;
    account.deleteSession({ sessionId: "current" }).catch(function () {}).then(function () {
      flag(false); try { localStorage.removeItem(LS); } catch (e) {} location.reload();
    });
  };

  account.get().then(function (u) { uid = u.$id; GK.mail = u.email; flag(true); return sync(); })
    .catch(function (e) {
      if (e && (e.code === 401 || e.code === 403)) { flag(false); showLogin(); }
      else if (!had()) showLogin();
      else setSt("Offline. Je gegevens staan veilig op dit apparaat.");
    });

  function retry() { if (uid && !document.hidden) { if (pending) dbDoc.set(S).catch(function () {}); else sync(); } }
  window.addEventListener("online", retry);
  document.addEventListener("visibilitychange", retry);
})();
