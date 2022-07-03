const admin = require("firebase-admin");
const SharedFunctions = require("../SharedFunctions");
const fdClientModule = require("fantasydata-node-client");
const Constants = require("../pubsubs/Constants");
const functions = require("firebase-functions");
const {scorePickList} = require("../pubsubs/Constants");
const sharedFunctions = new SharedFunctions();

module.exports = async (request, response) => {
    response.send(`Processed`);
}


async function scoreAPickList()  {
    let item = await admin.firestore().collection("pickLists").doc( 'Uk8i9Z1FLsyjSHWVF3mR').get()
    let pickList = item.data();

    scorePickList(pickList);
}
