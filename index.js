const express = require('express')
const cors = require('cors')
const app = express();
require('dotenv').config();

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 3000



//middleware 

app.use(express.json());
app.use(cors());


//mongodb uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xqjpkxx.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {

    try {
        await client.connect();

        const db = client.db('city_care_db');
        const issuesCollection = db.collection('issues');



        // issue post
        app.post('/issues', async (req, res) => {
            const issue = req.body;

            const userEmail = issue.citizenEmail;

            const count = await issuesCollection.countDocuments({
                citizenEmail: userEmail,
            });

            if (!issue.isPremium && count >= 3) {
                return res.status(403).send({
                    message: 'Free users can only report 3 issues',
                });
            }

            const newIssue = {
                ...issue,
                status: 'pending',
                priority: 'normal',
                upvotes: 0,
                upvotedBy: [],
                assignedStaff: null,
                createdAt: new Date(),
                timeline: [
                    {
                        status: 'pending',
                        message: 'Issue reported by citizen',
                        updatedBy: 'Citizen',
                        time: new Date(),
                    },
                ],
            };

            const result = await issuesCollection.insertOne(newIssue);

            res.send(result);
        });

        app.get('/issues', async (req, res) => {
            const userEmail = req.query.userEmail;
            if (!userEmail) return res.status(400).send({ message: 'Missing userEmail' });

            const issues = await issuesCollection.find({ userEmail }).toArray();
            res.send(issues);
        });






        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    }
    finally {

    }
}


run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('city care is running!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})