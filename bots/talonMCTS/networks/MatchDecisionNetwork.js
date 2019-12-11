var math = require("mathjs");
var fs = require("fs");
var Battle = require("./../../../servercode/sim/battle");
var TeamValidator = require("./../../../servercode/sim/team-validator").Validator;
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node');//neccessary for saving
const path = require('path');

const LEARN_RATE = 0.01;
const SAVE_PATH = "savedNeuralNetworks/matchDecisionNet";
/**
 * @typedef {{Pokedex: DexTable<Template>, Movedex: DexTable<Move>, Statuses: DexTable<EffectData>, TypeChart: DexTable<TypeData>, Scripts: DexTable<AnyObject>, Items: DexTable<Item>, Abilities: DexTable<Ability>, FormatsData: DexTable<ModdedTemplateFormatsData>, Learnsets: DexTable<{learnset: {[k: string]: MoveSource[]}}>, Aliases: {[id: string]: string}, Natures: DexTable<{[l: string]: string | undefined, name: string, plus?: string, minus?: string}>, Formats: DexTable<Format>}} DexTableData 
 * */

class MatchDecisionNetwork {
	/**
	 * @param {string} formatId
   * @param {?DexTableData} dexData
   * @param {string[]} pokedex
   * @param {string[]} movedex
	 */
  constructor(formatId, dexData){
      let self = this;
      /** @type {?DexTableData} */
      this.dexData = dexData;

      let teamValidator = new TeamValidator(formatId);

      /**@type string[] */
      this.simpleStatusProblems = ["brn", "frz", "par", "psn", "tox"];
      /**@type string[] */
      this.durationDependentStatusProblems = ["slp"];
      /**@type string[] */
      this.simpleVolatiles = ["mustrecharge", "parspeeddrop", "focusenergy", "brnattackdrop"];
      /**@type string[] */
      this.durationDependentVolatiles = ["confusion", "partiallytrapped", "partiallytrappinglock", "stall", "residualdmg"];
      /**@type string[] */
      this.moveAndDurationDependentVolatiles = ["lockedMove"];
      
      /**@type string[] */
      this.typeDex = Object.keys(dexData.TypeChart);
      /**@type string[] */
      this.pokedex = Object.keys(this.dexData.Pokedex); //Includes all species from all Gens
      //log.info(dexData.Movedex)
      this.movedex = [];
      //for(let entry in dex) log.info(this.teamValidator.validateSet({species: dex[entry]}))
      this.pokedex = this.pokedex.filter(entry => { 
          let problems = teamValidator.validateSet({species: entry}, {});
          return (problems.length === 1); //If it is legal, only one problem must exist: "Pokemon has no moves"
      })
      this.pokedex.forEach(poke => {
          Object.keys(dexData.Learnsets[poke].learnset).forEach(move => {
              if(!self.movedex.includes(move)) self.movedex.push(move);
          })
      });
  
      this.inputLayer = [];
      this.outputLayer = new Array(this.movedex.length + this.pokedex.length)

      this.formatId = formatId;

      /**@type tf.Sequential */
      this.net = null;
      this.xTrainData = [];
      this.yTrainData = [];
    }

    /**
     * @param {Battle} battle
     * @param {string} decisionMaker is either p1 or p2
     */
    getDecisionOdds(battle, decisionMaker, options){
      let self = this;
      this.setInput(battle, decisionMaker);

      let outputIndexesForOptions = [];
      for (let option of options){
        if (option.type === "switch"){
          let species = battle[decisionMaker].pokemon[option.id].template.id;
          outputIndexesForOptions.push(this.pokedex.indexOf(species));
        } else {
          outputIndexesForOptions.push(this.pokedex.length + this.movedex.indexOf(option.id));
        }
      }
      this.activateForward(outputIndexesForOptions);

      return options.map(option => {
        let outputLayerIndex = -1;
        if (option.type === "switch"){
          let species = battle[decisionMaker].pokemon[option.id].template.id;
          outputLayerIndex = this.pokedex.indexOf(species);
          option.species = species;
        } else {
          outputLayerIndex = this.pokedex.length + this.movedex.indexOf(option.id);
        }
        return {
          probability: self.outputLayer[outputLayerIndex],
          decision: option,
          indexInNN: outputLayerIndex
        }
      })
    }

    /**
     * @param {Battle} battle
     */
    setInput(battle, decisionMaker){
      //BIAS neuron
      this.inputLayer = [];
      
      //Set order. Decisionmaker is defined in the first input half.
      let sides = decisionMaker === "p1" ? [battle.p1, battle.p2] : [battle.p2, battle.p1];

      let speciesInput = new Array(this.pokedex.length);
      //let baseMoveSlotInput = new Array(this.movedex.length * 2);
      let levelInput = new Array(100);
      let simpleStatProbInput = new Array(this.simpleStatusProblems.length);
      let durationBasedStatProbInput = new Array(this.durationDependentStatusProblems.length * 2);
      let simpleVolatileInput = new Array(this.simpleVolatiles.length);
      let durationBasedVolatileInput = new Array(this.durationDependentVolatiles.length * 2);
      let moveSlotInput = new Array(this.movedex.length);
      let typesInput = new Array(this.typeDex.length);
      let boostsInput = new Array(7 * 13);
      let hpInput = new Array(800);
      let modifiedStatsInput = new Array(5);

      for(let sideIndex in sides){
        let side = sides[sideIndex];
        for(let pokemon of side.pokemon){

          let speciesIndex = this.pokedex.findIndex(speciesId => {
              return speciesId === pokemon.template.id;
          });
          for(let i = 0; i < speciesInput.length; i++) speciesInput[i] = 0;
          //speciesInput[speciesIndex] = 1;
          this.inputLayer.push(...speciesInput);
          
          /*for(let i = 0; i < baseMoveSlotInput.length; i++) baseMoveSlotInput[i] = 0;
          //debugger;
          for(let baseMoveSlot of pokemon.baseMoveSlots){
            let inputIndex = this.movedex.indexOf(baseMoveSlot.id) * 2;
            baseMoveSlotInput[inputIndex] = 1;
            //baseMoveSlotInput[inputIndex + 1] = baseMoveSlot.pp;
          }
          this.inputLayer.push(...baseMoveSlotInput);*/

          /*for(let i = 0; i < levelInput.length; i++) levelInput[i] = 0;
          //debugger;
          //levelInput[pokemon.level - 1] = 1;
          this.inputLayer.push(...levelInput);*/

          for(let i = 0; i < hpInput.length; i++) hpInput[i] = 0;
          for(let i = 0; i < pokemon.hp; i++) hpInput[i] = 1;
          this.inputLayer.push(...hpInput);

          for(let i = 0; i < simpleStatProbInput.length; i++) simpleStatProbInput[i] = 0;
          //debugger;
          let statusIndex = this.simpleStatusProblems.indexOf(pokemon.status);
          if(statusIndex !== -1) simpleStatProbInput[statusIndex] = 1;
          this.inputLayer.push(...simpleStatProbInput);

          for(let i = 0; i < durationBasedStatProbInput.length; i++) durationBasedStatProbInput[i] = 0;
          //debugger;
          statusIndex = this.durationDependentStatusProblems.indexOf(pokemon.status);
          if(statusIndex !== -1) {
            durationBasedStatProbInput[statusIndex * 2] = 1;
            durationBasedStatProbInput[statusIndex * 2 + 1] = pokemon.statusData.time;
          }
          this.inputLayer.push(...durationBasedStatProbInput);

          for(let i = 0; i < moveSlotInput.length; i++) moveSlotInput[i] = 0;
          //debugger;
          if(!pokemon.trueMoves) pokemon.trueMoves = [];
          for(let trueMove of pokemon.trueMoves){
            moveSlotInput[this.movedex.indexOf(trueMove)] = 1;
          }
          this.inputLayer.push(...moveSlotInput);

          for(let i = 0; i < typesInput.length; i++) typesInput[i] = 0;
          //debugger;
          for(let type of pokemon.types){
            typesInput[this.typeDex.indexOf(type)] = 1;
          }
          this.inputLayer.push(...typesInput);

          if(side.active.includes(pokemon)){
            for(let i = 0; i < simpleVolatileInput.length; i++) simpleVolatileInput[i] = 0;
            //debugger;
            for(let volatile of Object.keys(pokemon.volatiles)){
              let index = this.simpleVolatiles.indexOf(volatile);
              if(index !== -1) simpleVolatileInput[index] = 1;
            }
            this.inputLayer.push(...simpleVolatileInput);

            for(let i = 0; i < durationBasedVolatileInput.length; i++) durationBasedVolatileInput[i] = 0;
            //debugger;
            for(let volatile of Object.keys(pokemon.volatiles)){
              let index = this.durationDependentVolatiles.indexOf(volatile);
              if(index !== -1) {
                durationBasedVolatileInput[index * 2] = 1;
                let time = pokemon.volatiles[volatile].duration;
                if(time === undefined) time = pokemon.volatiles[volatile].time;
                if(time === undefined) time = pokemon.volatiles[volatile].counter;
                durationBasedVolatileInput[index * 2 + 1] = time;
              }
            }
            this.inputLayer.push(...durationBasedVolatileInput);

            if(pokemon.volatiles.substitute){
              this.inputLayer.push(1, pokemon.volatiles.substitute.hp)
            } else {
              this.inputLayer.push(0, 0)
            }

            for(let i = 0; i < boostsInput.length; i++) boostsInput[i] = 0;
            for(let i = 0; i < 7; i++) {
              let boostNumber = pokemon.boosts[["accuracy", "evasion", "atk", "def", "spa", "spd", "spe"][i]]
              boostsInput[i * 13 + 6 + boostNumber] = 1;
            }
            this.inputLayer.push(...boostsInput);

            /*for(let i = 0; i < modifiedStatsInput.length; i++) {
              modifiedStatsInput[i] = pokemon.modifiedStats[["atk", "def", "spa", "spd", "spe"][i]]
            }
            this.inputLayer.push(...modifiedStatsInput);*/

          }
        }
      }
      while(this.inputLayer.length < 19760) this.inputLayer.push(0);
    }

    activateForward(){
      this.outputLayer = this.net.predict(tf.tensor2d([this.inputLayer])).as1D();
      this.outputLayer = this.outputLayer.arraySync();
    }

    save(){
      debugger;
      let savePath = path.join(__dirname, "../../..", SAVE_PATH);
      if(savePath.startsWith("C:\\")) savePath = savePath.substr(3);

      if(this.net) return this.net.save('file:///' + savePath);
      
      return Promise.reject(new Error("No net to save"));
    }

    async load(force = false){
      if(this.net && !force) return;

      if(fs.existsSync(SAVE_PATH)) {
        let savePath = path.join(__dirname, "../../..", SAVE_PATH, "model.json");
        if(savePath.startsWith("C:\\")) savePath = savePath.substr(3);
        this.net = await tf.loadLayersModel('file:///' + savePath);
      } else {
        this.net = tf.sequential();
        this.net.add(tf.layers.dense({units: this.outputLayer.length, activation: 'sigmoid', inputShape: [19760], outputShape: [this.outputLayer.length]}));
      }
      this.net.compile({
        optimizer: "sgd",
        loss: 'meanSquaredError'
      });
    }

    addToTrainData(battle, decisionMaker, options, decision){
      this.setInput(battle, decisionMaker);
      this.xTrainData.push(this.inputLayer);

      let expectedOutput = new Array(this.outputLayer.length);
      for(let i = 0; i < expectedOutput.length; i++) expectedOutput[i] = 0;
      let outputIndex = 0;
      if (decision.type === "switch"){
        outputIndex = this.pokedex.indexOf(decision.id);
      } else {
        outputIndex = this.pokedex.length + this.movedex.indexOf(decision.id);
      }
      expectedOutput[outputIndex] = 1;
      this.yTrainData.push(expectedOutput);
    }

    train(){
      debugger;
      let xs = tf.tensor2d(this.xTrainData);
      let xy = tf.tensor2d(this.yTrainData);

      this.net.summary();
      let promise = this.net.fit(xs, xy);

      return promise;
    }

    /*train(battle, decisionMaker, options, decision){
      let decisionOdds = this.getDecisionOdds(battle, decisionMaker, options);

      let errGradientsHidden2 = [];
      for(let i in this.hiddenLayer2) errGradientsHidden2.push(0);

      for(let j in this.outputLayer){
        let outputToken = decisionOdds.find(token => token.indexInNN === j);
        let expectedVal = (outputToken && outputToken.decision.type === decision.type && outputToken.decision.id === decision.id) ? 1 : 0;
        let diff = expectedVal - expectedVal;

        let funGradient = 1;//outputToken.probability * (1 - outputToken.probability);
        let errGradient = diff * funGradient;

        for(let i in this.weights3[j]){
          this.weights3[j][i] -= LEARN_RATE * errGradient * this.hiddenLayer2[i];
          if(!this.weights3[j][i]) debugger;
          errGradientsHidden2[i] += /*this.hiddenLayer2[i] * (1 - this.hiddenLayer2[i]) * / this.weights3[j][i] * errGradient;
        }
      }
      
      let errGradientsHidden1 = [];
      for(let h in this.hiddenLayer2) errGradientsHidden1.push(0);

      for(let i in this.weights2){
        for(let h in this.weights2[i]){
          this.weights2[i][h] -= LEARN_RATE * errGradientsHidden2[i] * this.hiddenLayer1[h];
          if(!this.weights2[i][h]) debugger;
          errGradientsHidden1[h] += /*this.hiddenLayer1[h] * (1 - this.hiddenLayer1[h]) * / this.weights2[i][h] * errGradientsHidden2[i];
        }
      }

      for(let h in this.weights1){
        for(let g in this.weights1[h]){
          this.weights1[h][g] -= LEARN_RATE * errGradientsHidden1[h] * this.inputLayer[g];
          if(!this.weights1[h][g]) debugger;
        }
      }
    }*/
}

module.exports = MatchDecisionNetwork;