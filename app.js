const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001; // Adaptat pentru Render
const DB_FILE = './baza_date_laborator.json';
const SIGLA_FILE = './sigla.png';

// --- INITIALIZARE BAZĂ DATE ---
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ "Bacteriologie": [] }, null, 2));
}

// Configurare Utilizatori - AM MODIFICAT IN GEORGIANA
const USERS = {
    "anita": { pass: "1234", name: "Anita", role: "admin" },
    "georgiana": { pass: "5678", name: "Georgiana", role: "admin" },
    "asistent": { pass: "0000", name: "Asistent", role: "user" }
};

const ADMINS = ["anita", "georgiana"];

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // Servire Siglă
    if (parsedUrl.pathname === '/sigla.png') {
        fs.readFile(SIGLA_FILE, (err, data) => {
            if (err) { res.writeHead(404); res.end(); }
            else { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(data); }
        });
        return;
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const info = JSON.parse(body);
                let bd = JSON.parse(fs.readFileSync(DB_FILE));

                if (parsedUrl.pathname === '/api/login') {
                    if (USERS[info.user] && USERS[info.user].pass === info.pass) {
                        res.end(JSON.stringify({ success: true, name: USERS[info.user].name, userKey: info.user }));
                    } else res.end(JSON.stringify({ success: false }));
                    return;
                }

                if (parsedUrl.pathname === '/api/edit-cell') {
                    let item = bd[info.categorie].find(p => p.id == info.id);
                    if (item) {
                        if (info.camp === 'bucati') {
                            let vechi = parseInt(item.bucati);
                            let nou = parseInt(info.valoare);
                            if (nou < vechi) {
                                if (!item.istoric_iesiri) item.istoric_iesiri = [];
                                for (let i = 0; i < (vechi - nou); i++) item.istoric_iesiri.push(Date.now());
                            }
                            item.bucati = nou;
                        } else {
                            item[info.camp] = info.valoare;
                        }
                    }
                } else if (parsedUrl.pathname === '/api/add') {
                    bd[info.categorie].push({
                        id: Date.now(), denumire: info.produs, cod: info.cod || "-", lot: info.lot || "-",
                        data_scan: new Date().toLocaleDateString('ro-RO'), expirare: info.expirare || "-", 
                        bucati: parseInt(info.bucati) || 1, istoric_iesiri: []
                    });
                } else if (parsedUrl.pathname === '/api/add-category') {
                    if (info.nume && !bd[info.nume]) bd[info.nume] = [];
                }

                fs.writeFileSync(DB_FILE, JSON.stringify(bd, null, 2));
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false }));
            }
        });
        return;
    }

    // API Referat 30 zile
    if (parsedUrl.pathname === '/api/referat') {
        let bd = JSON.parse(fs.readFileSync(DB_FILE));
        let referatGrupat = {};
        const ACUM = Date.now();
        const O_LUNA = 30 * 24 * 60 * 60 * 1000;

        Object.keys(bd).forEach(cat => {
            let deComandat = bd[cat].filter(p => {
                let consum30 = (p.istoric_iesiri || []).filter(d => (ACUM - d) < O_LUNA).length;
                return parseInt(p.bucati) < consum30 || parseInt(p.bucati) === 0;
            }).map(p => ({
                ...p, 
                consum: (p.istoric_iesiri || []).filter(d => (ACUM - d) < O_LUNA).length,
                necesar: Math.max(1, (p.istoric_iesiri || []).filter(d => (ACUM - d) < O_LUNA).length - parseInt(p.bucati))
            }));
            if (deComandat.length > 0) referatGrupat[cat] = deComandat;
        });
        res.end(JSON.stringify(referatGrupat));
        return;
    }

    let bd = JSON.parse(fs.readFileSync(DB_FILE));
    let categoriile = Object.keys(bd);
    let catCurenta = parsedUrl.query.cat || categoriile[0];
    let produse = bd[catCurenta] || [];

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
<!DOCTYPE html>
<html lang="ro">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Laborator SPV</title>
    <script src="https://unpkg.com/html5-qrcode"></script>
    <style>
        :root { --p: #38bdf8; --p-dark: #0c4a6e; --s: #10b981; --d: #ef4444; --w: #f59e0b; }
        body { font-family: sans-serif; margin: 0; background: #f8fafc; color: #1e293b; }
        #login-screen { position: fixed; inset: 0; background: var(--p-dark); z-index: 9999; display: flex; align-items: center; justify-content: center; }
        .login-card { background: white; padding: 30px; border-radius: 20px; width: 280px; text-align: center; }
        .login-card img { width: 80px; margin-bottom: 15px; }
        header { background: var(--p); color: white; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        header img { height: 30px; margin-right: 10px; vertical-align: middle; }
        .nav-bar { background: white; border-bottom: 1px solid #e2e8f0; display: flex; padding: 8px; overflow-x: auto; }
        .nav-bar a { padding: 8px 15px; background: #f1f5f9; border-radius: 20px; text-decoration: none; color: #64748b; font-size: 12px; font-weight: bold; margin-right: 5px; white-space: nowrap; }
        .nav-bar a.active { background: var(--p); color: white; }
        .table-wrap { overflow-x: auto; background: white; margin-bottom: 80px; }
        table { width: 100%; border-collapse: collapse; min-width: 800px; }
        th { background: #f8fafc; padding: 12px; text-align: left; font-size: 11px; color: #94a3b8; border-bottom: 2px solid #e2e8f0; }
        td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; cursor: pointer; }
        .badge { background: #e0f2fe; color: var(--p-dark); padding: 5px 10px; border-radius: 6px; font-weight: bold; }
        .expired { background: #fee2e2 !important; color: #b91c1c; }
        .footer { position: fixed; bottom: 0; width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 15px; background: white; box-shadow: 0 -5px 15px rgba(0,0,0,0.1); }
        .btn { padding: 15px; border: none; border-radius: 12px; color: white; font-weight: bold; cursor: pointer; }
        #ref-win, #scan-win, #add-win { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center; }
        .modal { background:white; padding:25px; border-radius:20px; width:90%; max-width:500px; max-height: 85vh; overflow-y: auto; }
        .ref-header { text-align: center; border-bottom: 2px solid #eee; margin-bottom: 15px; padding-bottom: 10px; }
        .ref-header img { width: 60px; }
        .ref-sector { background: #f1f5f9; padding: 8px; font-weight: bold; margin-top: 15px; border-left: 4px solid var(--p); }
        .ref-line { display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #eee; font-size: 14px; }
        input, select { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #e2e8f0; border-radius: 10px; box-sizing: border-box; }
    </style>
</head>
<body>

    <div id="login-screen">
        <div class="login-card">
            <img src="/sigla.png" onerror="this.style.display='none'">
            <h3 style="margin:0; color:var(--p-dark);">Gestiune SPV</h3>
            <select id="u-sel">
                <option value="anita">Anita (Admin)</option>
                <option value="georgiana">Georgiana (Admin)</option>
                <option value="asistent">Asistent</option>
            </select>
            <input type="password" id="p-inp" placeholder="Parolă">
            <button onclick="doLogin()" style="width:100%; padding:12px; background:var(--p); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">INTRARE</button>
        </div>
    </div>

    <header>
        <div style="font-weight:bold; display:flex; align-items:center;">
            <img src="/sigla.png" onerror="this.style.display='none'">
            <span>Laborator SPV</span>
        </div>
        <div>
            <button onclick="genReferat()" style="background:var(--w); border:none; color:white; border-radius:8px; padding:8px 12px; cursor:pointer; font-weight:bold; font-size:12px;">📋 REFERAT</button>
            <button onclick="doLogout()" style="background:none; border:1px solid white; color:white; border-radius:8px; padding:5px 12px; cursor:pointer; font-size:12px;">Ieșire</button>
        </div>
    </header>

    <div class="nav-bar">
        ${categoriile.map(c => `<a href="/?cat=${encodeURIComponent(c)}" class="${c===catCurenta?'active':''}">${c}</a>`).join('')}
        <button onclick="newCat()" style="border:none; background:none; color:var(--p); font-size:24px; cursor:pointer; padding:0 10px;">+</button>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr><th>Produs</th><th>Cod</th><th>Lot</th><th>Data Scan</th><th>Expirare</th><th>Stoc</th></tr>
            </thead>
            <tbody>
                ${produse.map(p => {
                    let rowClass = (p.expirare && p.expirare !== '-') ? (new Date(p.expirare.split('.').reverse().join('-')) < new Date().setHours(0,0,0,0) ? 'expired' : '') : '';
                    return `
                    <tr class="${rowClass}">
                        <td onclick="ed('${p.id}','denumire','${p.denumire}')"><b>${p.denumire}</b></td>
                        <td onclick="ed('${p.id}','cod','${p.cod}')">${p.cod}</td>
                        <td onclick="ed('${p.id}','lot','${p.lot}')">${p.lot}</td>
                        <td style="font-size:11px; color:#94a3b8;">${p.data_scan}</td>
                        <td onclick="ed('${p.id}','expirare','${p.expirare}')"><b>${p.expirare}</b></td>
                        <td onclick="ed('${p.id}','bucati','${p.bucati}')"><span class="badge">${p.bucati}</span></td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    </div>

    <div id="ref-win"><div class="modal">
        <div class="ref-header">
            <img src="/sigla.png" onerror="this.style.display='none'">
            <h2 style="margin:5px 0; color:var(--p-dark);">Referat de Achiziții</h2>
            <small>Necesar bazat pe consumul ultimelor 30 zile</small>
        </div>
        <div id="ref-content"></div>
        <button onclick="window.print()" style="width:100%; padding:15px; background:var(--p); color:white; border:none; border-radius:12px; font-weight:bold; margin-top:20px; cursor:pointer;">PRINTEAZĂ PDF</button>
        <button onclick="document.getElementById('ref-win').style.display='none'" style="width:100%; margin-top:10px; border:none; background:none; color:#64748b; cursor:pointer;">Închide</button>
    </div></div>

    <div id="scan-win">
        <div id="reader" style="width:300px; border-radius:15px; overflow:hidden; background:white;"></div>
        <button onclick="stopScan()" style="margin-top:25px; color:white; background:none; border:2px solid white; padding:10px 20px; border-radius:20px; cursor:pointer;">ÎNCHIDE CAMERA</button>
    </div>

    <div id="add-win"><div class="modal">
        <h3>Adaugă Produs</h3>
        <input type="text" id="a-name" placeholder="Denumire">
        <input type="text" id="a-cod" placeholder="Cod">
        <input type="text" id="a-lot" placeholder="Lot">
        <input type="text" id="a-exp" placeholder="Expirare (ZZ.LL.AAAA)">
        <input type="number" id="a-qty" value="1">
        <button onclick="saveAdd()" style="width:100%; padding:15px; background:var(--s); color:white; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">SALVEAZĂ</button>
    </div></div>

    <div class="footer">
        <button class="btn" style="background:var(--s)" onclick="startS('IN')">📥 INTRARE (+1)</button>
        <button class="btn" style="background:var(--d)" onclick="startS('OUT')">📤 CONSUM (-1)</button>
    </div>

    <script>
        let scanner = null;
        const cat = "${catCurenta}";
        const ADMINS = ${JSON.stringify(ADMINS)};

        function doLogin() {
            const user = document.getElementById('u-sel').value, pass = document.getElementById('p-inp').value;
            fetch('/api/login', { method: 'POST', body: JSON.stringify({user, pass}) })
            .then(r => r.json()).then(res => { 
                if(res.success) { 
                    localStorage.setItem('lab_log_spv', '1'); 
                    localStorage.setItem('lab_user_key', res.userKey);
                    document.getElementById('login-screen').style.display='none'; 
                } else alert("Parolă incorectă!"); 
            });
        }
        function doLogout() { localStorage.clear(); location.reload(); }
        if(localStorage.getItem('lab_log_spv')) document.getElementById('login-screen').style.display='none';

        function ed(id, camp, v) {
            const user = localStorage.getItem('lab_user_key');
            if(!ADMINS.includes(user)) {
                alert("Doar Admin (Anita/Georgiana) poate modifica manual datele!");
                return;
            }
            let n = prompt("Modifică " + camp.toUpperCase(), v);
            if(n !== null && n !== v) fetch('/api/edit-cell', { method: 'POST', body: JSON.stringify({categorie: cat, id, camp, valoare: n}) }).then(() => location.reload());
        }

        function genReferat() {
            fetch('/api/referat').then(r => r.json()).then(data => {
                const container = document.getElementById('ref-content');
                container.innerHTML = "";
                const sectoare = Object.keys(data);
                if(!sectoare.length) container.innerHTML = "<p style='text-align:center;'>Toate stocurile sunt suficiente conform consumului.</p>";
                sectoare.forEach(s => {
                    let h = \`<div class="ref-sector">\${s}</div>\`;
                    data[s].forEach(p => {
                        h += \`<div class="ref-line">
                            <span>\${p.denumire} <small>(\${p.lot})</small></span>
                            <span>Consum lunar: \${p.consum} | <b>Comandă: \${p.necesar}</b></span>
                        </div>\`;
                    });
                    container.innerHTML += h;
                });
                document.getElementById('ref-win').style.display = 'flex';
            });
        }

        function startS(m) {
            document.getElementById('scan-win').style.display='flex';
            scanner = new Html5Qrcode("reader");
            scanner.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, (t) => {
                let found = false;
                document.querySelectorAll('tbody tr').forEach(row => {
                    if(row.cells[1].innerText == t || row.cells[0].innerText.toLowerCase() == t.toLowerCase()) {
                        found = true;
                        let id = row.cells[0].getAttribute('onclick').match(/'(\\d+)'/)[1];
                        let q = parseInt(row.querySelector('.badge').innerText);
                        let nq = (m === 'IN') ? q + 1 : Math.max(0, q - 1);
                        fetch('/api/edit-cell', { method: 'POST', body: JSON.stringify({categorie: cat, id, camp: 'bucati', valoare: nq}) }).then(() => { stopScan(); location.reload(); });
                    }
                });
                if(!found && m === 'IN') { 
                    stopScan(); document.getElementById('add-win').style.display='flex'; document.getElementById('a-cod').value = t; 
                } else if(!found && m === 'OUT') { stopScan(); alert("Produsul nu a fost găsit!"); }
            }).catch(()=>{});
        }

        function stopScan() { if(scanner) scanner.stop().then(() => { document.getElementById('scan-win').style.display='none'; scanner=null; }); }

        function saveAdd() {
            const p = { categorie: cat, produs: document.getElementById('a-name').value, cod: document.getElementById('a-cod').value, lot: document.getElementById('a-lot').value, expirare: document.getElementById('a-exp').value, bucati: document.getElementById('a-qty').value };
            fetch('/api/add', { method: 'POST', body: JSON.stringify(p) }).then(() => location.reload());
        }

        function newCat() {
            const user = localStorage.getItem('lab_user_key');
            if(!ADMINS.includes(user)) return alert("Doar adminul poate adăuga sectoare!");
            let n = prompt("Nume sector nou:");
            if(n) fetch('/api/add-category', { method: 'POST', body: JSON.stringify({nume: n}) }).then(() => location.reload());
        }
    </script>
</body>
</html>
    `);
});

server.listen(PORT, () => console.log(`Aplicația rulează pe portul \${PORT}`));
