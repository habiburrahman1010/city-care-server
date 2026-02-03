const express = require('express')
const cors = require('cors')
const app = express();
require('dotenv').config();


const stripe = require('stripe')(process.env.STRIPE_PAYMENT);

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


        // Get user 
        app.get('/users/:email', async (req, res) => {
            const { email } = req.params;
            const user = await usersCollection.findOne({ email });
            if (!user) return res.status(404).send({ message: 'User not found' });
            res.send(user);
        });

        app.patch('/users/:email', async (req, res) => {
            const { email } = req.params;
            const updateData = req.body;

            const result = await usersCollection.findOneAndUpdate(
                { email },
                { $set: updateData },
                { returnDocument: 'after' }
            );

            if (!result.value) return res.status(404).send({ message: 'User not found' });
            res.send(result.value);
        });



        //payment related api
        app.post('/premium-checkout-session', async (req, res) => {
            const { email } = req.body;

            if (!email) return res.status(400).send({ error: 'Email is required' });

            try {
                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: [
                        {
                            price_data: {
                                currency: 'usd',
                                unit_amount: 1000 * 100,
                                product_data: {
                                    name: 'Premium Subscription',
                                },
                            },
                            quantity: 1,
                        },
                    ],
                    mode: 'payment',
                    customer_email: email,
                    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-canceled`,

                    metadata: { email },
                });

                res.send({ url: session.url });
            } catch (err) {
                console.error('Stripe checkout error:', err);
                res.status(500).send({ error: 'Failed to create checkout session' });
            }
        });

        app.patch('/premium-success', async (req, res) => {
            try {
                const { sessionId, email } = req.body;

                if (!sessionId || !email) {
                    return res.status(400).send({ message: 'sessionId and email required' });
                }

                const session = await stripe.checkout.sessions.retrieve(sessionId);

                if (session.payment_status !== 'paid') {
                    return res.status(400).send({ message: 'Payment not completed' });
                }

                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { isPremium: true, premiumAt: new Date() } }
                );

                res.send({ success: true, result });
            } catch (error) {
                console.error('Premium update error:', error);
                res.status(500).send({ message: 'Verification failed' });
            }
        });



        app.post('/issues', async (req, res) => {
            const issue = req.body;
            const userEmail = issue.userEmail;

            if (!userEmail) {
                return res.status(400).send({ message: 'userEmail is required' });
            }


            const user = await usersCollection.findOne({ email: userEmail });

            if (!user) {
                return res.status(404).send({ message: 'User not found' });
            }


            const count = await issuesCollection.countDocuments({ userEmail });


            if (!user.isPremium && count >= 3) {
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