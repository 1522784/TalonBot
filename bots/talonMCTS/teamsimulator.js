PossibleTeam = require("./possibleteam")
var log = require('log4js').getLogger("teamSimulator");
var TeamValidator = require("./../../ServerCode/sim/team-validator").Validator

var DecisionPropCalcer = require("./simpledecisionpropcalcer")

class TeamSimulator{
    
    constructor(teamNum, battle) {
        log.info("new Teamsimulator")
        this.teamStore = [];
        this.decisionPropCalcer = DecisionPropCalcer();
        let format = battle.id.slice(7, -10)
        log.info(format)
        this.teamValidator = new TeamValidator(format);
        for(let i = 0; i<teamNum; i++)
            this.teamStore.push(new PossibleTeam(battle, this.decisionPropCalcer, this.teamValidator));
    }

    updateTeams(battle){
        for(let i = 0; i<teamNum; i++)
            if(teamStore[i].isStillPossible(battle))
                this.teamStore[i].updateRank(battle.history, 1)
            else {
                this.teamStore[i] = new PossibleTeam(battle, this.decisionPropCalcer);
                this.teamStore[i].updateRank(battle.history, -1)
            }
    }

    getRandomTeam(battle){
        rankSum = 0;
        for(let i = 0; i<teamNum; i++)
            rankSum = math.add(rankSum, this.teamStore[i].getRank());

        rand = math.random(0, rankSum)
        for(let i = 0; i<teamNum; i++){
            rand = math.subtract(rand, this.teamStore[i].getRank());
            if(math.smallerEq(rand, 0))
                return this.teamStore[i];
        }
        throw new Error("mathjs doesn't work");
    }
}

module.exports = TeamSimulator;