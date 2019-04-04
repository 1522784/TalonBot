PossibleTeam = require("./possibleteam")
var log = require('log4js').getLogger("teamSimulator");
var TeamValidator = require("./../../ServerCode/sim/team-validator").Validator
var clone = require("./../../clone");

var DecisionPropCalcer = require("./simpledecisionpropcalcer")

class TeamSimulator{
    
    constructor(teamNum, battle, ownSide) {
        log.info("new Teamsimulator")
        let self = this;

        this.teamStore = [];
        this.decisionPropCalcer = new DecisionPropCalcer();
        let format = battle.id.slice(7, -10)
        this.teamValidator = new TeamValidator(format);
        this.history = [];
        this.ownSide = ownSide;

        this.dex = Object.keys(this.teamValidator.dex.loadData().Pokedex); //Includes all species from all Gens
        //for(let entry in dex) log.info(this.teamValidator.validateSet({species: dex[entry]}))
        this.dex = this.dex.filter(entry => { 
            let problems = self.teamValidator.validateSet({species: entry}, {});
            return (problems.length === 1); //If it is legal, only one problem must exist: "Pokemon has no moves"
        })

        //We save the first pokemon the opponent used because it has a special position. TODO: Adapt to team preview for Gen5 and following
        this.lead = battle.p2.pokemon[0].speciesid;

        for(let i = 0; i<teamNum; i++)
            this.teamStore.push(new PossibleTeam(battle, this.decisionPropCalcer, this.teamValidator, this.dex, this.lead));
    }

    addStateToHistory(battleState){
        battleState = clone(battleState)
        battleState.templateCache = this.teamValidator.dex.templateCache;
        battleState.itemCache = this.teamValidator.dex.itemCache;
        battleState.abilityCache = this.teamValidator.dex.abilityCache;

        this.history.push({
            state: battleState
        });
    }

    addOwnDecisionToHistory(decision){
        let historyToken = this.history[this.history.length-1]
        historyToken.ownDecision = decision;
    }

    getHistory(){
        return this.history.map(historyToken => {
            let clonedState = clone(historyToken.state);
            clonedState.templateCache = historyToken.state.templateCache;
            clonedState.itemCache = historyToken.state.itemCache;
            clonedState.abilityCache = historyToken.state.abilityCache;
            return {
                state: clonedState,
                ownDecision: historyToken.ownDecision
            };
        });
    }

    updateTeams(battle, logs){
        for(let i = 0; i<this.teamStore.length; i++){
            if(!this.teamStore[i].isStillPossible(battle, logs))
                this.teamStore[i] = new PossibleTeam(battle, this.decisionPropCalcer, this.teamValidator, this.dex, this.lead);
            this.teamStore[i].updateRank(battle, logs, this.getHistory(), this.ownSide);
        }
    }

    getRandomTeam(){
        rankSum = this.teamStore.map(team => team.getRank()).reduce((rank1, rank2) => math.add(rank1, rank2));

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