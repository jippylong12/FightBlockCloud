const axios = require('axios').default;

class MikeGAPIClient {
    baseUrl = 'https://mike-goldberg.herokuapp.com';

    async fightResults(fightId) {
        return await axios.get(`${this.baseUrl}/actions`, {
            params: {
                'fightId': fightId
            },
        })
            .then((data) => {
                return data.data;
            }).catch((err) => {
                return {};
            });
    }
}


module.exports = MikeGAPIClient;
