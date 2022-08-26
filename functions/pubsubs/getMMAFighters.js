const fdClientModule = require("fantasydata-node-client");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const Constants = require("./Constants");
const SharedFunctions = require("../SharedFunctions");
const sharedFunctions = new SharedFunctions();
const FantasyAnalyticsClient = require("../fa_api/fa_client");

module.exports = async (context) => {

    let snapshot = await admin.firestore().collection("apis/v2/fighters").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => [doc.id, doc.data()])
    });

    let client = new FantasyAnalyticsClient();
    await client.login();

    let oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7); // 7 days from today
    const filterDateTime = oneWeekAgo.toISOString();
    let eventDetailSnapshot = await admin.firestore().collection("apis/v2/eventDetails")
        .where('DateTime', '>=', filterDateTime)
        .orderBy("DateTime", "desc").get().then(querySnapshot => {
            return querySnapshot.docs.map(function(doc) { return doc;})
        });

    let fighterIds = new Set();
    for (const doc of eventDetailSnapshot) {
        for(const fight of doc.data()['Fights']) {
            fighterIds.add(fight['Fighters'][0]['FighterId']);
            fighterIds.add(fight['Fighters'][1]['FighterId']);
        }
    }

    let counter = 0;
    let commitCounter = 0;
    let batches = [];

    batches[commitCounter] = admin.firestore().batch();


    for (const fighterId of fighterIds) {
        let fighterData = await client.getFighter(fighterId);
        fighterData = transformFighterData(fighterData);

        let foundFighter = snapshot.find(item => item[1].FighterId === fighterData['FighterId']);
        if (snapshot.length === 0 || foundFighter === undefined) {
            if(counter <= 498){
                batches[commitCounter].set(admin.firestore().collection('apis/v2/fighters').doc(), fighterData)
                counter = counter + 1;
            } else {
                counter = 0;
                commitCounter = commitCounter + 1;
                batches[commitCounter] = admin.firestore().batch();
                batches[commitCounter].set(admin.firestore().collection('apis/v2/fighters').doc(), fighterData)
            }
        } else {
            if(counter <= 498){
                batches[commitCounter].update(admin.firestore().collection('apis/v2/fighters').doc(foundFighter[0]), fighterData)
                counter = counter + 1;
            } else {
                counter = 0;
                commitCounter = commitCounter + 1;
                batches[commitCounter] = admin.firestore().batch();
                batches[commitCounter].update(admin.firestore().collection('apis/v2/fighters').doc(foundFighter[0]), fighterData)
            }
        }

    }


    await sharedFunctions.writeToDb(batches);

    return null;


    function transformFighterData(fighterData) {
        fighterData['BirthDate'] = new Date(`${fighterData['dateOfBirth']}Z`).toISOString().replace("Z", "")
        fighterData['CareerStats'] = addCareerStats(fighterData);
        fighterData['Wins'] = fighterData['wins'];
        fighterData['Draws'] = fighterData['draws'];
        fighterData['Losses'] = fighterData['losses'];
        fighterData['FighterId'] = fighterData['id'];
        fighterData['FirstName'] = fighterData['firstName'];
        fighterData['LastName'] = fighterData['lastName'];
        fighterData['Height'] = betterRounding(fighterData['height'] / 2.54, 0); // from cm to inches
        fighterData['Nickname'] = fighterData['nickname'];
        fighterData['Reach'] = betterRounding(fighterData['reach'] /2.54, 0);
        fighterData['SubmissionLosses'] = fighterData['lossesSubmission'];
        fighterData['Submissions'] = fighterData['winsSubmission'];
        fighterData['TechnicalKnockoutLosses'] = fighterData['lossesKoTko'];
        fighterData['TechnicalKnockouts'] = fighterData['winsKoTko'];
        fighterData['WeightClass'] = fighterData['weightClass'];


        delete fighterData['dateOfBirth'];
        delete fighterData['wins'];
        delete fighterData['draws'];
        delete fighterData['losses'];
        delete fighterData['id'];
        delete fighterData['firstName'];
        delete fighterData['lastName'];
        delete fighterData['height'];
        delete fighterData['nickname'].trim();
        delete fighterData['reach'];
        delete fighterData['lossesSubmission'];
        delete fighterData['winsSubmission'];
        delete fighterData['lossesKoTko'];
        delete fighterData['winsKoTko'];
        delete fighterData['weightClass'];



        return fighterData;



        function addCareerStats(fighterData) {
            let _object = {};
            const totalFights = (fighterData['wins'] + fighterData['losses'] + fighterData['draws']) * 1.0;
            const decisionCount = (fighterData['winsDecision'] + fighterData['lossesDecision']) * 100.0;
            _object['DecisionPercentage'] = betterRounding(decisionCount/totalFights, 2)


            return _object;
        }

        function betterRounding(value, decimals) {
            return Number(Number(Math.round(value + 'e' + decimals) + 'e-' + decimals).toFixed(decimals));
        }
    }
}
