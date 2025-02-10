const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
//require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require('bcrypt');

const app = express();
const PORT = 5000;

app.use(cors()); // Autorise les requêtes du client React
app.use(bodyParser.json()); // Permet de lire le JSON envoyé par le client


app.listen(PORT, () => {
    console.log(`Serveur en écoute sur local host : 5000`);
    console.log(process.env.SUPABASE_DB_URL)
});


const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }, // Supabase nécessite SSL
});

pool.query("SELECT NOW()", (err, res) => {
    if (err) {
        console.error("Échec de la connexion à Supabase :", err);
    } else {
        console.log("Connexion réussie à Supabase :", res.rows[0]);
    }
});


app.post('/api/registerUser', async (req, res) => {
    const { nomUtilisateur, mdp } = req.body;
  
    // Validation de base pour vérifier que les champs ne sont pas vides
    if (!nomUtilisateur || !mdp) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }
  
    // Vérifier si l'utilisateur existe déjà (éviter les doublons)
    const checkUser = await pool.query('SELECT * FROM utilisateurs WHERE "nomUtilisateur" = $1', [nomUtilisateur]);

    if (checkUser.rows.length > 0) {
      return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
    }
  
    // Hasher le mot de passe
    const saltRounds = 10;
    bcrypt.hash(mdp, saltRounds, async (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur de hachage du mot de passe' });
        }
    
        // Insérer l'utilisateur dans la base de données de façon sécurisée
        try {
            const result = await pool.query(
            'INSERT INTO utilisateurs ("nomUtilisateur", "mdpHash") VALUES ($1, $2) RETURNING *',
            [nomUtilisateur, hashedPassword]
            );
    
            // Retourner l'utilisateur enregistré
            res.status(201).json({
            message: 'Utilisateur créé avec succès',
            user: result.rows[0],
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });
});


app.post("/api/ajouterVictoire", async (req,res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const {nomUtilisateur} = req.body;

    const result = await pool.query('SELECT * FROM utilisateurs WHERE "nomUtilisateur" = $1', [nomUtilisateur]);

    if(result.rows.length === 0)
    {
        return res.status(400).json({error : "Nom d'utilisateur inconnu."})
    }

    const user = result.rows[0];

    if(user.IP !== ip)
    {
        return res.status(402).json({error : "Vous n'êtes pas connecté à ce compte."})
    }

    const nbVictoiresQuery = await pool.query('SELECT "nbVictoires" FROM utilisateurs WHERE "nomUtilisateur" = $1', [nomUtilisateur]);

    if (nbVictoiresQuery.rows.length === 0) {
        return res.status(400).json({ error: "Erreur lors de la récupération des défaites." });
    }

    const nbVictoires = nbVictoiresQuery.rows[0].nbVictoires; // On récupère la valeur réelle
    
    const victoirePlusUn = await pool.query(
        'UPDATE utilisateurs SET "nbVictoires" = $2 WHERE "nomUtilisateur" = $1 RETURNING *',        
        [nomUtilisateur, nbVictoires + 1]
    );
    res.json({ message: "Victoire ajoutée avec succès", utilisateur: victoirePlusUn.rows[0] });

})



app.post("/api/ajouterDefaite", async (req, res) => {
    const { nomUtilisateur } = req.body;

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    try {
        const result = await pool.query('SELECT * FROM utilisateurs WHERE "nomUtilisateur" = $1', [nomUtilisateur]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Nom d'utilisateur inconnu." });
        }

        const user = result.rows[0];

        if (user.IP !== ip) {
            return res.status(403).json({ error: "Vous n'êtes pas connecté à ce compte." });
        }

        // Récupération du nombre de défaites
        const nbDefaitesQuery = await pool.query('SELECT "nbDefaites" FROM utilisateurs WHERE "nomUtilisateur" = $1', [nomUtilisateur]);

        if (nbDefaitesQuery.rows.length === 0) {
            return res.status(400).json({ error: "Erreur lors de la récupération des défaites." });
        }

        const nbDefaites = nbDefaitesQuery.rows[0].nbDefaites; // On récupère la valeur réelle

        // Incrémentation et mise à jour
        const defaitePlusUn = await pool.query(
            'UPDATE utilisateurs SET "nbDefaites" = $2 WHERE "nomUtilisateur" = $1 RETURNING *',
            [nomUtilisateur, nbDefaites + 1]
        );

        res.json({ message: "Défaite ajoutée avec succès", utilisateur: defaitePlusUn.rows[0] });
    } catch (error) {
        console.error("Erreur serveur :", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});


app.post('/api/connexion', async (req, res) => {
    const { nomUtilisateur, mdp } = req.body;

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
    if (!nomUtilisateur || !mdp) {
        return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }

    
    const result = await pool.query('SELECT * FROM utilisateurs WHERE "nomUtilisateur" = $1', [nomUtilisateur]);
    
    
    if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
    }
    
    const user = result.rows[0];
    
    bcrypt.compare(mdp, user.mdpHash, async (err, isMatch) => {

        if (err) {
            return res.status(500).json({ error: 'Erreur serveur' });
        }


        if (!isMatch) {
            return res.status(400).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
        }

        const ipEnvoie = await pool.query(
            'UPDATE utilisateurs SET "IP" = $2 WHERE "nomUtilisateur" = $1 RETURNING *',        
            [nomUtilisateur, ip]
        );

        const statsResult = await pool.query('SELECT "meilleurTemps","nbVictoires","nbDefaites" FROM utilisateurs WHERE id = $1', [user.id]);

        // Si les statistiques existent, on les renvoie
        const statsVal = statsResult.rows[0];

        const responseObj = {
            message: 'Connexion réussie',
            stats: {
              nbVictoires: statsVal.nbVictoires,
              nbDefaites: statsVal.nbDefaites,
              meilleurTemps: statsVal.meilleurTemps
            }
        };

        res.status(200).json(responseObj);
    });
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

app.post("/api/autoConnect", async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;


    const result = await pool.query('SELECT "nbVictoires", "nbDefaites", "meilleurTemps", "nomUtilisateur" FROM utilisateurs WHERE "IP" = $1', [ip]);

    if (result.rows.length === 0) {
        return res.status(400).json({ error: "Aucun compte connecté à cet IP" });
    }

    const statsVal = result.rows[0];

    const responseObj = {
        message: 'Connexion réussie',
        stats: {
          nbVictoires: statsVal.nbVictoires,
          nbDefaites: statsVal.nbDefaites,
          meilleurTemps: statsVal.meilleurTemps,
          nomUtilisateur: statsVal.nomUtilisateur
        }
    };

    res.status(200).json(responseObj);
})

app.post("/api/deconnexion", async (req, res) => {

    const { nomUtilisateur } = req.body;



    const result = await pool.query('SELECT * FROM utilisateurs WHERE "nomUtilisateur" = $1', [nomUtilisateur]);

    if (result.rows.length === 0) {
        return res.status(400).json({ error: "Aucun compte associé à votre nom d'utilisateur" });
    }

    const ipEnvoie = await pool.query(
        'UPDATE utilisateurs SET "IP" = NULL WHERE "nomUtilisateur" = $1 RETURNING *',        
        [nomUtilisateur]
    );

    res.status(201).json({reponse : "Déconnexion réussie"});

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

        const randomFile = files[Math.floor(Math.random() * files.length)];

        fs.readFile(path.join(dataFolder, randomFile), "utf8", (err, data) => {
            if (err) {
                console.error("Erreur de lecture du fichier :", err);
                return res.status(500).json({ error: "Erreur de lecture du fichier" });
            }

            res.json({ file: randomFile, data: JSON.parse(data) });
        });
    });
});