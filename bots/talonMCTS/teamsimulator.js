PossibleTeam = require("./possibleteam")
var log = require('log4js').getLogger("teamSimulator");
var TeamValidator = require("./../../ServerCode/sim/team-validator").Validator

var DecisionPropCalcer = require("./simpledecisionpropcalcer")

class TeamSimulator{
    
    constructor(teamNum, battle) {
        log.info("new Teamsimulator")
        this.teamStore = [];
        let self = this;

        this.decisionPropCalcer = new DecisionPropCalcer();
        let format = battle.id.slice(7, -10)
        this.teamValidator = new TeamValidator(format);

        this.dex = Object.keys(this.teamValidator.dex.loadData().Pokedex); //Includes all species from all Gens
        //for(let entry in dex) log.info(this.teamValidator.validateSet({species: dex[entry]}))
        this.dex = this.dex.filter(entry => { 
            let problems = self.teamValidator.validateSet({species: entry}, {});
            return (problems.length === 1); //If it is legal, only one problem must exist: "Pokemon has no moves"
        })

        this.lead = battle.p2.pokemon[0].species;

        for(let i = 0; i<teamNum; i++)
            this.teamStore.push(new PossibleTeam(battle, this.decisionPropCalcer, this.teamValidator, this.dex, this.lead));
    }

    updateTeams(battle){
        for(let i = 0; i<this.teamStore.length; i++)
            if(this.teamStore[i].isStillPossible(battle))
                this.teamStore[i].updateRank(battle.log, 1)
            else {
                this.teamStore[i] = new PossibleTeam(battle, this.decisionPropCalcer, this.teamValidator, this.dex, this.lead);
                this.teamStore[i].updateRank(battle.log, -1)
            }
    }

    getRandomTeam(battle){
        rankSum = 0;
        for(let i = 0; i<this.teamStore.length; i++)
            rankSum = math.add(rankSum, this.teamStore[i].getRank());

        rand = math.random(0, rankSum)
        for(let i = 0; i<this.teamStore.length; i++){
            rand = math.subtract(rand, this.teamStore[i].getRank());
            if(math.smallerEq(rand, 0))
                return this.teamStore[i];
        }
        throw new Error("mathjs doesn't work");
    }
}

module.exports = TeamSimulator;