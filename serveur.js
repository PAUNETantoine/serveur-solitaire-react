const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");


const app = express();
const PORT = 5000;

app.use(cors()); // Autorise les requêtes du client React
app.use(bodyParser.json()); // Permet de lire le JSON envoyé par le client


app.listen(PORT, () => {
    console.log(`Serveur en écoute sur http://serveur-solitaire-react-production.up.railway.app`);
});


const dataFolder = path.join(__dirname, "data");
if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder);
}


app.post("/api/data", (req, res) => {
    const newData = req.body;
    const fileName = `${Date.now()}.json`; // Générer un nom unique

    fs.writeFile(path.join(dataFolder, fileName), JSON.stringify(newData, null, 2), (err) => {
        if (err) {
            console.error("Erreur d'écriture :", err);
            return res.status(500).json({ error: "Erreur d'écriture dans le fichier" });
        }
        res.json({ message: "Données bien enregistrées !", file: fileName });
        console.log("Nouvelle partie gagnante enregistrée !")
    });
});


app.post("/api/estOn", (req, res) => {
	res.status(200).json({estOn : true});
})


app.get("/api/random-data", (req, res) => {
    fs.readdir(dataFolder, (err, files) => {
        if (err) {
            console.error("Erreur de lecture du dossier :", err);
            return res.status(500).json({ error: "Erreur de lecture du dossier" });
        }

        if (files.length === 0) {
            return res.status(404).json({ error: "Aucun fichier disponible" });
        }

        // Sélectionner un fichier aléatoire
        const randomFile = files[Math.floor(Math.random() * files.length)];

        // Lire le contenu du fichier sélectionné
        fs.readFile(path.join(dataFolder, randomFile), "utf8", (err, data) => {
            if (err) {
                console.error("Erreur de lecture du fichier :", err);
                return res.status(500).json({ error: "Erreur de lecture du fichier" });
            }

            res.json({ file: randomFile, data: JSON.parse(data) });
        });
    });
});