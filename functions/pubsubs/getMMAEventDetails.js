const Constants = require("./Constants");
const fdClientModule = require("fantasydata-node-client");
const admin = require("firebase-admin");
const SharedFunctions = require("../SharedFunctions");
const sharedFunctions = new SharedFunctions();
const functions = require("firebase-functions");

module.exports = async (context) => {

    const FantasyDataClient = new fdClientModule(Constants.keys);
    let snapshot = await admin.firestore().collection("events").where("Status", "==", "Scheduled").orderBy("DateTime", "desc").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });

    let eventDetailSnapshot = await admin.firestore().collection("eventDetails").where("Status", "==", "Scheduled").get().then(querySnapshot => {
        return querySnapshot.docs.map(function(doc) { return {[doc.data()['EventId']]: [doc.id,doc.data()]}})
    });

    for (const event of snapshot) {
        await FantasyDataClient.MMAv3ScoresClient.getEventPromise(event['EventId']).then(async results => {
            results = JSON.parse(results);
            let eventDetail = eventDetailSnapshot.find(item => item[results['EventId']]);

            if (eventDetail) {
                // if it exists
                eventDetail = eventDetail[results['EventId']];
                functions.logger.info(`Updating eventDetails ${JSON.stringify(eventDetail[0])}`, {structuredData: true});

                // WE NEED TO UPDATE THE EVENT DETAILS FOR FUTURE CARDS AND THEN
                await admin.firestore().collection('eventDetails').doc(eventDetail[0]).set(results)


                // GET ALL PICK LISTS WITH SAME ID AND THEN UPDATE THAT DATA AS WELL
                let counter = 0;
                let commitCounter = 0;
                let batches = [];

                batches[commitCounter] = admin.firestore().batch();

                let pickLists = await admin.firestore().collection("pickLists").where("eventId", "==", results['EventId']).get()
                pickLists.forEach(function(list) {
                    let updateId = list.id;
                    let listData = list.data();

                    // for each pick list, let's update the fight data
                    results['Fights'].forEach(function(fight) {
                        // exclude early prelims
                        if(!(fight['CardSegment'] === null) && !(fight['CardSegment'] === 'Early Prelims')){
                            // if the pick list doesn't allow prelims we don't want them either
                            // always allow main card events
                            if((fight['CardSegment'] === 'Prelims' && listData['prelims']) || fight['CardSegment'] === 'Main Card'){

                                let pickIndex = listData['picks'].findIndex(item => item['fightData']['Order'] === fight['Order']);

                                // we don't want these ones

                                if(pickIndex !== -1){
                                    // replace the current fight data
                                    listData['picks'][pickIndex]['fightData'] = fight;
                                } else {
                                    // add the new item
                                    listData['picks'].push({
                                        perfectHit: false,
                                        fighterIdChosen: null,
                                        roundChosen: null,
                                        FotNBool: false,
                                        correctWinnerBool: null,
                                        fightData: fight,
                                        score: 0,
                                        methodChosen: null,
                                    });
                                }
                            }



                        }

                    })


                    listData['picks'].sort(sharedFunctions.sortByOrder);

                    if(counter <= 498){
                        batches[commitCounter].set(admin.firestore().collection('pickLists').doc(updateId), listData)
                        counter = counter + 1;
                    } else {
                        counter = 0;
                        commitCounter = commitCounter + 1;
                        batches[commitCounter] = admin.firestore().batch();
                        batches[commitCounter].set(admin.firestore().collection('pickLists').doc(updateId), listData)
                    }
                })

                await sharedFunctions.writeToDb(batches);

            } else{
                // it doesn't exist so add it
                functions.logger.info(`Adding eventDetails ${JSON.stringify(results)}`, {structuredData: true});
                await  admin.firestore().collection('eventDetails').add(results);
            }
        }).catch(error => {
            functions.logger.error("Client failed!", {structuredData: true});
            functions.logger.error(error, {structuredData: true});
        })
    }



    return null;
}
