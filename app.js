const http = require('http');
const url = require('url');
const { MongoClient, ObjectId } = require('mongodb');

// Conexiunea folosind datele tale din imagini
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

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            try {
                const info = JSON.parse(body);
                const col = db.collection("stocuri");

                if (parsedUrl.pathname === '/api/add') {
                    await col.insertOne({
                        categorie: info.categorie || "Bacteriologie", denumire: info.produs, cod: info.cod || "-", 
                        lot: info.lot || "-", data_scan: new Date().toLocaleDateString('ro-RO'), 
                        expirare: info.expirare || "-", bucati: parseInt(info.bucati) || 0
                    });
                    res.end(JSON.stringify({ success: true }));
                }
                else if (parsedUrl.pathname === '/api/edit-cell') {
                    await col.updateOne({ _id: new ObjectId(info.id) }, { $set: { [info.camp]: info.valoare } });
                    res.end(JSON.stringify({ success: true }));
                }
            } catch (e) { res.end(JSON.stringify({ success: false })); }
        });
        return;
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laborator SPV</title>
    <script src="https://unpkg.com/html5-qrcode"></script>
    <style>
        body { font-family: sans-serif; margin: 0; background: #f8fafc; padding-bottom: 80px; }
        header { background: #38bdf8; color: white; padding: 15px; font-weight: bold; }
        .nav { display: flex; overflow-x: auto; padding: 10px; background: white; border-bottom: 1px solid #ddd; }
        .nav a { padding: 8px 15px; text-decoration: none; background: #eee; border-radius: 20px; margin-right: 5px; color: #333; font-size: 13px; }
        .nav a.active { background: #38bdf8; color: white; }
        table { width: 100%; border-collapse: collapse; background: white; }
        td, th { padding: 12px 10px; border-bottom: 1px solid #eee; text-align: left; }
        .footer { position: fixed; bottom: 0; width: 100%; display: grid; grid-template-columns: 1fr; padding: 10px; background: white; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); }
        .btn { padding: 15px; border: none; border-radius: 10px; color: white; font-weight: bold; background: #10b981; }
        #scan-win { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index: 2000; align-items:center; justify-content:center; flex-direction:column; }
    </style>
</head>
<body>
    <header>LABORATOR SPV</header>
    <div class="nav">
        \${categoriile.map(c => \`<a href="/?cat=\${encodeURIComponent(c)}" class="\${c===catCurenta?'active':''}">\${c}</a>\`).join('')}
    </div>
    <table>
        <thead><tr><th>Produs</th><th>Stoc</th></tr></thead>
        <tbody>
            \${produse.map(p => \`
                <tr>
                    <td>\${p.denumire}</td>
                    <td onclick="ed('\${p._id}','bucati','\${p.bucati}')"><b>\${p.bucati}</b></td>
                </tr>
            \`).join('')}
        </tbody>
    </table>
    <div id="scan-win">
        <div id="reader" style="width:300px; background:white;"></div>
        <button onclick="stopScan()" style="margin-top:20px; color:white;">ÎNCHIDE</button>
    </div>
    <div class="footer"><button class="btn" onclick="startS()">ADĂUGARE PRODUS (SCAN)</button></div>
    <script>
        function ed(id, camp, v) {
            let n = prompt("Noua valoare:", v);
            if(n) fetch('/api/edit-cell', { method: 'POST', body: JSON.stringify({id, camp, valoare: n}) }).then(() => location.reload());
        }
        let scanner = null;
        function startS() {
            document.getElementById('scan-win').style.display='flex';
            scanner = new Html5Qrcode("reader");
            scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (t) => {
                stopScan();
                let nume = prompt("Denumire produs nou:");
                if(nume) fetch('/api/add', { method: 'POST', body: JSON.stringify({produs: nume, cod: t, bucati: 1, categorie: "${catCurenta}"}) }).then(() => location.reload());
            });
        }
        function stopScan() { if(scanner) scanner.stop().then(() => document.getElementById('scan-win').style.display='none'); }
    </script>
</body>
</html>
    `);
});

server.listen(PORT);
