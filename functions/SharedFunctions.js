
module.exports = function () {
    this.oneSecond = function () {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve('resolved');
            }, 1010);
        });
    }

    this.writeToDb = async function (arr) {
        console.log("beginning write");
        for (var i = 0; i < arr.length; i++) {
            await this.oneSecond();
            arr[i].commit().then(function () {
                console.log("wrote batch " + i);
            });
        }
        console.log("done.");
    }

    this.sortByOrder = function ( a, b ){
        if ( a['fightData']['Order'] < b['fightData']['Order'] ){
            return -1;
        }
        if ( a['fightData']['Order'] > b['fightData']['Order'] ){
            return 1;
        }
        return 0;
    }
}


