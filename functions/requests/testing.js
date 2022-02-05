const admin = require("firebase-admin");
const SharedFunctions = require("../SharedFunctions");
const sharedFunctions = new SharedFunctions();

module.exports  = async (request, response) => {

    response.send(`Processed`);

}
