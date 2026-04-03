const http = require('http');
const url = require('url');
const { MongoClient, ObjectId } = require('mongodb');

// --- CONEXIUNEA TA MONGO ---
const MONGO_URI = "mongodb+srv://anitaandreca28_db_user:Px4vAM4mjlJgCokH@cluster0.mlztw9j.mongodb.net/LaboratorSPV?retryWrites=true&w=majority";
const PORT = process.env.PORT || 3001;

let db;
async function connectDB() {
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db("LaboratorSPV");
        console.log("Conectat la MongoDB!");
    } catch(e) { console.error("Eroare DB:", e); }
}
connectDB();

const ADMINS = ["anita", "georgiana"];
const USERS = {
    "anita": { pass: "1234", name: "Anita" },
    "georgiana": { pass: "5678", name: "Georgiana" },
    "asistent": { pass: "0000", name: "Asistent" }
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            try {
                const info = JSON.parse(body);
                const col = db.collection("stocuri");

                if (parsedUrl.pathname === '/api/login') {
                    if (USERS[info.user] && USERS[info.user].pass === info.pass) {
                        res.end(JSON.stringify({ success: true, name: USERS[info.user].name, userKey: info.user }));
                    } else res.end(JSON.stringify({ success: false }));
                } 
                else if (parsedUrl.pathname === '/api/add') {
                    await col.insertOne({
                        categorie: info.categorie || "Bacteriologie", denumire: info.produs, cod: info.cod || "-", 
                        lot: info.lot || "-", data_scan: new Date().toLocaleDateString('ro-RO'), 
                        expirare: info.expirare || "-", bucati: parseInt(info.bucati) || 0, istoric_iesiri: []
                    });
                    res.end(JSON.stringify({ success: true }));
                }
                else if (parsedUrl.pathname === '/api/edit-cell') {
                    let doc = await col.findOne({ _id: new ObjectId(info.id) });
                    let update = {};
                    if (info.camp === 'bucati') {
                        let nou = parseInt(info.valoare);
                        if (nou < doc.bucati) {
                            let iesiri = doc.istoric_iesiri || [];
                            for(let i=0; i < (doc.bucati - nou); i++) iesiri.push(Date.now());
                            update.istoric_iesiri = iesiri;
                        }
                        update.bucati = nou;
                    } else {
                        update[info.camp] = info.valoare;
                    }
                    await col.updateOne({ _id: new ObjectId(info.id) }, { $set: update });
                    res.end(JSON.stringify({ success: true }));
                }
            } catch (e) { res.end(JSON.stringify({ success: false })); }
        });
        return;
    }

    if (parsedUrl.pathname === '/api/referat') {
        const ACUM = Date.now();
        const O_LUNA = 30 * 24 * 60 * 60 * 1000;
        const toate = await db.collection("stocuri").find().toArray();
        let ref = {};
        toate.forEach(p => {
            let consum = (p.istoric_iesiri || []).filter(d => (ACUM - d) < O_LUNA).length;
            if (p.bucati < consum || p.bucati === 0) {
                if(!ref[p.categorie]) ref[p.categorie] = [];
                ref[p.categorie].push({ denumire: p.denumire, consum, necesar: Math.max(1, consum - p.bucati) });
            }
        });
        return res.end(JSON.stringify(ref));
    }

    let categoriile = await db.collection("stocuri").distinct("categorie");
    if(!categoriile.length) categoriile = ["Bacteriologie"];
    let catCurenta = parsedUrl.query.cat || categoriile[0];
    let produse = await db.collection("stocuri").find({ categorie: catCurenta }).toArray();

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Laborator SPV</title>
        <script src="https://unpkg.com/html5-qrcode"></script>
        <style>
            :root { --p: #38bdf8; --p-dark: #0c4a6e; --s: #10b981; --d: #ef4444; --w: #f59e0b; }
            body { font-family: sans-serif; margin: 0; background: #f8fafc; padding-bottom: 80px; }
            header { background: var(--p); color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
            .nav { display: flex; overflow-x: auto; padding: 10px; background: white; border-bottom: 1px solid #ddd; }
            .nav a { padding: 8px 15px; text-decoration: none; background: #eee; border-radius: 20px; margin-right: 5px; color: #333; font-size: 13px; white-space: nowrap; }
            .nav a.active { background: var(--p); color: white; }
            table { width: 100%; border-collapse: collapse; background: white; }
            th { text-align: left; padding: 10px; background: #f1f5f9; font-size: 11px; color: #64748b; }
            td { padding: 12px 10px; border-bottom: 1px solid #eee; font-size: 14px; }
            .badge { background: #e0f2fe; padding: 5px 10px; border-radius: 5px; font-weight: bold; color: var(--p-dark); }
            .footer { position: fixed; bottom: 0; width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px; background: white; box-sizing: border-box; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); }
            .btn { padding: 18px; border: none; border-radius: 12px; color: white; font-weight: bold; cursor: pointer; font-size: 14px; }
            #login-screen { position: fixed; inset: 0; background: var(--p-dark); z-index: 10000; display: flex; align-items: center; justify-content: center; }
            #scan-win { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index: 2000; align-items:center; justify-content:center; flex-direction:column; }
        </style>
    </head>
    <body>
        <div id="login-screen">
            <div style="background:white; padding:30px; border-radius:20px; text-align:center; width: 80%;">
                <h3 style="margin-top:0;">Gestiune Laborator</h3>
                <select id="u-sel" style="width:100%; padding:12px; margin-bottom:15px; border-radius:8px;">
                    <option value="anita">Anita</option>
                    <option value="georgiana">Georgiana</option>
                    <option value="asistent">Asistent</option>
                </select>
                <input type="password" id="p-inp" placeholder="Parolă" style="width:100%; padding:12px; margin-bottom:15px; box-sizing:border-box; border:1px solid #ddd; border-radius:8px;">
                <button onclick="doLogin()" style="width:100%; padding:12px; background:var(--p); color:white; border:none; border-radius:8px; font-weight:bold;">INTRARE</button>
            </div>
        </div>

        <header>
            <span>LABORATOR SPV</span>
            <button onclick="genReferat()" style="background:var(--w); border:none; color:white; padding:8px 12px; border-radius:8px; font-size:12px;">📋 REFERAT</button>
        </header>

        <div class="nav">
            ${categoriile.map(c => \`<a href="/?cat=\${encodeURIComponent(c)}" class="\${c===catCurenta?'active':''}">\${c}</a>\`).join('')}
        </div>

        <table>
            <thead><tr><th>Produs</th><th>Lot</th><th>Exp.</th><th>Stoc</th></tr></thead>
            <tbody>
                ${produse.map(p => \`
                    <tr>
                        <td onclick="ed('\${p._id}','denumire','\${p.denumire}')"><b>\${p.denumire}</b></td>
                        <td onclick="ed('\${p._id}','lot','\${p.lot}')">\${p.lot}</td>
                        <td onclick="ed('\${p._id}','expirare','\${p.expirare}')">\${p.expirare}</td>
                        <td onclick="ed('\${p._id}','bucati','\${p.bucati}')"><span class="badge">\${p.bucati}</span></td>
                    </tr>
                \`).join('')}
            </tbody>
        </table>

        <div id="scan-win">
            <div id="reader" style="width:300px; border-radius:15px; overflow:hidden;"></div>
            <button onclick="stopScan()" style="margin-top:30px; color:white; border:2px solid white; background:none; padding:12px 30px; border-radius:10px; font-weight:bold;">ÎNCHIDE CAMERA</button>
        </div>

        <div class="footer">
            <button class="btn" style="background:var(--s)" onclick="startS('IN')">📥 INTRARE (+1)</button>
            <button class="btn" style="background:var(--d)" onclick="startS('OUT')">📤 CONSUM (-1)</button>
        </div>

        <script>
            const ADMINS = ["anita", "georgiana"];
            function doLogin() {
                const user = document.getElementById('u-sel').value, pass = document.getElementById('p-inp').value;
                fetch('/api/login', { method: 'POST', body: JSON.stringify({user, pass}) })
                .then(r => r.json()).then(res => { 
                    if(res.success) { 
                        localStorage.setItem('lab_user', res.userKey); 
                        document.getElementById('login-screen').style.display='none'; 
                    } else alert("Parolă incorectă!");
                });
            }
            if(localStorage.getItem('lab_user')) document.getElementById('login-screen').style.display='none';

            function ed(id, camp, v) {
                if(!ADMINS.includes(localStorage.getItem('lab_user'))) return alert("Doar Anita sau Georgiana pot edita manual!");
                let n = prompt("Modifică " + camp.toUpperCase(), v);
                if(n !== null) fetch('/api/edit-cell', { method: 'POST', body: JSON.stringify({id, camp, valoare: n}) }).then(() => location.reload());
            }

            let scanner = null;
            function startS(m) {
                document.getElementById('scan-win').style.display='flex';
                scanner = new Html5Qrcode("reader");
                scanner.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, (t) => {
                    stopScan();
                    let rows = Array.from(document.querySelectorAll('tbody tr'));
                    let match = rows.find(r => r.innerText.toLowerCase().includes(t.toLowerCase()));

                    if(match) {
                        let id = match.cells[0].getAttribute('onclick').split("'")[1];
                        let stocVechi = parseInt(match.querySelector('.badge').innerText);
                        let stocNou = (m === 'IN') ? stocVechi + 1 : Math.max(0, stocVechi - 1);
                        fetch('/api/edit-cell', { method: 'POST', body: JSON.stringify({id, camp: 'bucati', valoare: stocNou}) }).then(() => location.reload());
                    } else if (m === 'IN') {
                        let nume = prompt("Cod NOU detectat: " + t + "\\nIntrodu denumirea produsului:");
                        if(nume) fetch('/api/add', { method: 'POST', body: JSON.stringify({ produs: nume, cod: t, bucati: 1, categorie: "${catCurenta}" }) }).then(() => location.reload());
                    } else {
                        alert("Produsul nu a fost găsit în acest sector!");
                    }
                }).catch(err => alert("Eroare cameră: " + err));
            }
            function stopScan() { if(scanner) scanner.stop().then(() => document.getElementById('scan-win').style.display='none'); }

            function genReferat() {
                fetch('/api/referat').then(r => r.json()).then(data => {
                    let msg = "REFERAT NECESAR COMANDĂ:\\n\\n";
                    let gol = true;
                    for(let cat in data) {
                        gol = false;
                        msg += "--- " + cat.toUpperCase() + " ---\\n";
                        data[cat].forEach(p => { msg += "• " + p.denumire + " (Necesar: " + p.necesar + ")\\n"; });
                    }
                    alert(gol ? "Stocuri suficiente!" : msg);
                });
            }
        </script>
    </body>
    </html>
    `);
});

server.listen(PORT);
