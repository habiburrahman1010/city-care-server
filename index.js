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
        const usersCollection = db.collection('users');

        ///users api 

        app.post('/users', async (req, res) => {
            try {
                const user = req.body;

                if (!user?.email) {
                    return res.status(400).send({ message: 'Email is required' });
                }

                const email = user.email;

                const userExists = await usersCollection.findOne({ email });

                if (userExists) {
                    return res.send({
                        message: 'user already exists',
                        user: userExists,
                    });
                }

                const newUser = {
                    email: user.email,
                    displayName: user.displayName || '',
                    photoURL: user.photoURL || '',
                    role: 'citizen',
                    isPremium: false,
                    isBlocked: false,
                    createdAt: new Date(),
                };

                const result = await usersCollection.insertOne(newUser);

                res.send({
                    insertedId: result.insertedId,
                    user: newUser,
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Failed to create user' });
            }
        });




        // issue post
        app.post('/issues', async (req, res) => {
            const issue = req.body;

            const userEmail = issue.userEmail;

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


        // get single issue by id
        app.get('/issues/:id', async (req, res) => {
            const { id } = req.params;

            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ message: 'Invalid ID' });
            }

            const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });

            if (!issue) {
                return res.status(404).send({ message: 'Issue not found' });
            }

            res.send(issue);
        });

        app.patch('/issues/:email/:id', async (req, res) => {
            const { id, email } = req.params;
            const updateData = req.body;

            const result = await issuesCollection.findOneAndUpdate(
                { _id: new ObjectId(id), userEmail: email },
                { $set: updateData },
                { returnDocument: 'after' }
            );

            res.send(result.value);
        });


        //get api
        app.get('/issues', async (req, res) => {
            const userEmail = req.query.userEmail;
            if (!userEmail) return res.status(400).send({ message: 'Missing userEmail' });

            const issues = await issuesCollection.find({ userEmail }).toArray();
            res.send(issues);
        });


        app.delete('/issues/:email/:id', async (req, res) => {
            const { email, id } = req.params;

            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ message: 'Invalid ID format' });
            }

            const result = await issuesCollection.deleteOne({
                _id: new ObjectId(id),
                userEmail: email,
            });

            if (result.deletedCount === 0) {
                return res.status(404).send({ message: 'Issue not found or not authorized' });
            }

            res.send({
                deletedCount: result.deletedCount,
                message: 'Deleted successfully',
            });
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