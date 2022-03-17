const admin = require("firebase-admin");
const SharedFunctions = require("../SharedFunctions");
const fdClientModule = require("fantasydata-node-client");
const Constants = require("../pubsubs/Constants");
const functions = require("firebase-functions");
const sharedFunctions = new SharedFunctions();

module.exports  = async (request, response) => {
    response.send(`Processed`);
}
