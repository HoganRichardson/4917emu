/*
 * Implementation of the Emulator
 *
 */

const CPUSTATES = [ "FETCH", "INCREMENT", "EXECUTE" ]
const CLOCKDELAY = 1000 // Time in ms for each CPU step
const BELLDELAY = CLOCKDELAY * 3 // Bell timeout
const INST2BSTART = 8;
var emu_data = null;
var cpuState = 0 // index of CPUSTATES array
var initialState = [] // Stores initial state of memory before execution, restored by 'reset'
var registers = { }
var data = null // The 'data' for 2-byte instructions
var stopFlag = false // Set to true when stop command issued

/****************
 * FRONT END UI *
 ****************/
async function getJSONFile(file) {
    const response = await fetch(file, {});
    const json = await response.json();

    return json;
}

window.addEventListener("load", (event) => {
    configFile = "./config/" + document.title + ".json"
    getJSONFile(configFile).then(json => {
        emu_data = json;
        documentSetup();
    })
});

function documentSetup() {
    // Set up page
    document.getElementById("h1-title").innerHTML = emu_data.name + " Microprocessor";

    emu_data.sysRegisters.forEach(function (item) {
        var newRow = document.getElementById("sys-registers").insertRow();
        newRow.innerHTML = "<th>" + item + "</th>"
        newRow.innerHTML += "<td id=reg-" + item + ">0</td>"

        registers[item] = 0
    })

    emu_data.gpRegisters.forEach(function (item) {
        var newRow = document.getElementById("gp-registers").insertRow();
        newRow.innerHTML = "<th>" + item + "</th>"
        newRow.innerHTML += "<td id=reg-" + item + ">0</td>"
        
        registers[item] = 0
    })

    // TODO add memory cells dynamically!
    for (var i = 0; i < Math.sqrt(emu_data.memSize); i++) {
        var newRow = document.createElement("div");
        newRow.classList.add("row");
        newRow.classList.add("mb-3");

        for (var j = 0; j < Math.sqrt(emu_data.memSize); j++) {
            var currAddr = Math.sqrt(emu_data.memSize) * i + j;

            var newCol= document.createElement("div");
            newCol.classList.add("col");
            newRow.appendChild(newCol);

            var formText = document.createElement("div");
            formText.classList.add("form-text");
            formText.innerHTML = currAddr.toString(16).padStart(2, '0');
            newCol.appendChild(formText);

            var input = document.createElement("input");
            input.id = "mem" + currAddr.toString(16).padStart(2, '0')
            input.type = "text"
            input.classList.add("form-control")
            input.value = "00"
            newCol.appendChild(input);
        }
        document.getElementById("mp-grid").appendChild(newRow);
    }

    emu_data.instructions1B.forEach(function (item) {
        var newRow = document.getElementById("1binstructions").insertRow();
        var cell0 = newRow.insertCell();
        var cell1 = newRow.insertCell();
        var cell2 = newRow.insertCell();
        cell0.innerHTML = item[0].toString(16).padStart(2, '0');
        cell1.innerHTML = "<code>" + item[1] + "</code>"
        cell2.innerHTML = item[2]
    })
    emu_data.instructions2B.forEach(function (item) {
        var newRow = document.getElementById("2binstructions").insertRow();
        var cell0 = newRow.insertCell();
        var cell1 = newRow.insertCell();
        var cell2 = newRow.insertCell();
        cell0.innerHTML = item[0].toString(16).padStart(2, '0');
        cell1.innerHTML = "<code>" + item[1] + "</code>"
        cell2.innerHTML = item[2]
    })
}

function changeRunState(CPUisRunning) {
    if (CPUisRunning) {
        buttonReset.disabled = true;
        buttonStop.disabled = false;
        buttonRun.disabled = true;
        buttonStep.disabled = true;

        input_list = document.getElementsByTagName("input")
        for (var i = 0; i < input_list.length; i++) {
            input_list[i].disabled = true;
        }
    } else {
        buttonReset.disabled = false;
        buttonStop.disabled = true;
        buttonRun.disabled = false;
        buttonStep.disabled = false;

        input_list = document.getElementsByTagName("input")
        for (var i = 0; i < input_list.length; i++) {
            input_list[i].disabled = false;
        }
    }
}

const buttonReset = document.getElementById("button-reset");
const buttonStop = document.getElementById("button-stop");
const buttonRun  = document.getElementById("button-run");
const buttonStep = document.getElementById("button-step");
const buttonSave = document.getElementById("button-save");
const buttonLoad = document.getElementById("button-load");
const fileInput  = document.getElementById("file-load");
const printer = document.getElementById("printer");

/* Button Event Handlers */
buttonReset.addEventListener("click", (event) => {
    // Restore memory
    if (initialState.length == emu_data.memSize) {
        for (let i = 0; i < emu_data.memSize; i++) {
            setMemory(i, initialState[i])
        }
    }

    // Reset all registers
    for (var key in registers) {
        setRegister(key, 0);
    }

    cpuState = 0;
    updateCycleIndicator(CPUSTATES[cpuState]);

    clearPrinter();
});

buttonStop.addEventListener("click", (event) => {
    stopFlag = true;
    buttonStop.disabled = true; 
});

buttonRun.addEventListener("click", (event) => {
    cpuRunner(false);
});

buttonStep.addEventListener("click", (event) => {
    cpuRunner(true);
});

buttonSave.addEventListener("click", (event) => {
    // Get all memory values as array
    var memoryExport = getAllMemory();
    const blob = new Blob([JSON.stringify(memoryExport)], { type: 'application/json' });
    const dl_url = URL.createObjectURL(blob);
    download(dl_url, 'memory.json')
});

buttonLoad.addEventListener("click", (event) => {
    const selectedFile = document.getElementById("file-load").files[0];
    selectedFile.text().then(json => {
        // Read json file into memory
        data = JSON.parse(json)
        for (let i = 0; i < emu_data.memSize; i++) {
            setMemory(i, data[i])
        }
    })
});

fileInput.addEventListener("change", (event) => {
    if (event.target.files.length > 0) {
        buttonLoad.disabled = false;
    } else {
        buttonLoad.disabled = true;
    }
});

/* Memory Cell Event Handlers */
Array.from(document.getElementsByTagName("input")).forEach(element => {
    element.addEventListener("focusout", (event) => {
        validateMemory(idToMem(event.target.id));
    })
})

/********************
 * HELPER FUNCTIONS *
 ********************/
const download = (path, filename) => {
    const anchor = document.createElement('a');
    anchor.href = path;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

function getMemory(addr) {
    memString = document.getElementById(memToId(addr)).value;
    memValue = parseInt(memString, 16);
    return memValue
}

function setMemory(addr, value) {
    document.getElementById(memToId(addr)).value = value.toString(16).padStart(2, '0');
}

function getAllMemory() {
    var memoryArray= [];
    for (let i = 0; i < emu_data.memSize; i++) {
       memoryArray.push(getMemory(i)); 
    }

    return memoryArray;
}

function memToId(addr) {
    return "mem" + addr.toString(16).padStart(2, '0');
}

function idToMem(id) {
    return parseInt(id.replace("mem", ""), 16);
}

function validateMemory(addr) {
    mem = getMemory(addr);
    if (isNaN(mem) || mem >= Math.pow(2, emu_data.bits)) {
        document.getElementById(memToId(addr)).classList.add("is-invalid");
    } else {
        document.getElementById(memToId(addr)).classList.remove("is-invalid");
    }
}

function validateAllMemory() {
    for (let i = 0; i < emu_data.memSize; i++) {
        validateMemory(i)
    }
}

function clearPrinter() {
    printer.value = "";
    printer.scrollTop = printer.scrollHeight;
}

const indicatorFetch = document.getElementById("indicator-fetch");
const indicatorIncr = document.getElementById("indicator-incr");
const indicatorExec = document.getElementById("indicator-exec");

function updateCycleIndicator(state) {
    switch(state) {
        case "FETCH": 
            indicatorFetch.classList.add("list-group-item-danger");
            indicatorIncr.className = "list-group-item";
            indicatorExec.className = "list-group-item";
            break;
        case "INCREMENT":
            indicatorFetch.className = "list-group-item";
            indicatorIncr.classList.add("list-group-item-warning");
            indicatorExec.className = "list-group-item";
            break;
        case "EXECUTE":
            indicatorFetch.className = "list-group-item";
            indicatorIncr.className = "list-group-item";
            indicatorExec.classList.add("list-group-item-success");
            break;
    }
}

function getRegister(reg) {
    return registers[reg]
}

function setRegister(reg, value) {
    // Enforce unsigned int with max bitness
    while (value < 0) { 
        value += Math.pow(2, emu_data.bits);
    }
    registers[reg] = value % Math.pow(2, emu_data.bits);

    document.getElementById("reg-" + reg).innerHTML = registers[reg].toString(16);
}

/*************
 * EMULATOR  *
 *************/
function sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function cpuRunner(isStep) {
    changeRunState(true);

    // If IP == 0, store memory state before starting, so it can be reset
    if (getRegister("IP") == 0) {
        initialState = getAllMemory();
    }

    // Run a step of CPU
    if (isStep) {
        cpuStep();
    } else {
        halt = false;
        while (!halt && !stopFlag) {
            halt = cpuStep();
            await sleep(CLOCKDELAY);
        }
    }

    stopFlag = false;
    // Set state of CPU to stopped
    changeRunState(false);
}

/* Perform a step of the CPU cycle */
function cpuStep() {
    // Run step
    isHalt = false;
    switch(CPUSTATES[cpuState]) {
        case "FETCH": 
            cpuFetch();
            break;
        case "INCREMENT":
            cpuIncrement();
            break;
        case "EXECUTE":
            isHalt = cpuExecute();
            break;
    }

    // Update and display next state
    cpuState = (cpuState + 1) % 3;
    updateCycleIndicator(CPUSTATES[cpuState]);

    return isHalt;
}

function cpuFetch() {
    // Copy instruction at IP to instruction store
    var ip = getRegister("IP");
    setRegister("IS", getMemory(ip));
    data = getMemory(ip + 1);
}

function cpuIncrement() {
    // Increment Instruction Pointer
    var increment = 1;
    if (getRegister("IS") >= INST2BSTART) {
        increment = 2;
    }
    setRegister("IP", getRegister("IP") + increment);
}

function cpuExecute() {
    // Execute instruction in IS
    var inst = getRegister("IS");

    // Check if halt instruction
    if (inst == 0) {
        writeToPrinter("\nHalt!")
        return true; 
    }

    // Parse instruction based on emulator type
    switch(emu_data.name) {
        case "4001":
            instruction4001(inst);
            break;
        case "4002":
            instruction4002(inst);
            break;
        case "4003":
            instruction4003(inst);
            break;
        case "4004":
            instruction4004(inst);
            break;
        case "8008":
            instruction8008(inst);
            break;
        case "4917":
            instruction4917(inst);
            break;
    }

    // Return true if instruction is 'halt'
    return false;
}

/*** INSTRUCTION PRIMATIVES ***/
/*   Most instructions call one of these functions */
function writeToPrinter(text) {
    printer.value += text;
    printer.scrollTop = printer.scrollHeight;
}

function writeAsciiToPrinter(charCode) {
    printer.value += String.fromCharCode(charCode);
}

function ringBell() {
    var bell = document.getElementById("bell");
    bell.classList.remove("invisible")

    setTimeout(function() {
        bell.classList.add("invisible");
    }, BELLDELAY); 
}


function instrAddRegs(r1, r2) {
    setRegister(r1, getRegister(r1) + getRegister(r2));
}

function instrSubtractRegs(r1, r2) {
    setRegister(r1, getRegister(r1) - getRegister(r2));
}

function instrIncrementReg(r) {
    setRegister(r, getRegister(r) + 1);
}

function instrDecrementReg(r) {
    setRegister(r, getRegister(r) - 1);
}

function instrSwapRegs(r1, r2) {
    var r1copy = getRegister(r1);
    setRegister(r1, getRegister(r2));
    setRegister(r2, r1copy);
}

function instrSwapRegData(r) {
    var rcopy = getRegister(r);
    setRegister(r, data);
    setMemory(data, rcopy);
}

function instrJump() {
    setRegister("IP", data);
}

function instrJumpIfZ(r) {
    if (getRegister(r) == 0) {
        setRegister("IP", data);
    }
}

function instrJumpIfnotZ(r) {
    if(getRegister(r) != 0) {
        setRegister("IP", data);
    }
}

/*** 4001 Instruction Set ***/
function instruction4001(inst) {
    switch (inst) {
        case 1:
            // R = R + 1
            setRegister("R", getRegister("R") + 1);
            break;

        case 2:
            // R = R + 2
            setRegister("R", getRegister("R") + 2);
            break;

        case 3:
            // R = R + 3
            setRegister("R", getRegister("R") + 3);
            break;

        case 4:
            // R = R + 4
            setRegister("R", getRegister("R") + 4);
            break;

        case 7:
            // Print R
            writeToPrinter(getRegister("R"));
            break;
    }
}

/*** 4002 Instruction Set ***/
function instruction4002(inst) {
    switch (inst) {
        case 1:
            instrIncrementReg("R");
            break;

        case 2:
            instrDecrementReg("R");
            break;

        case 7:
            writeToPrinter(getRegister("R"));
            break;
    }
}

/*** 4003 Instruction Set ***/
function instruction4003(inst) {
    switch (inst) {
        case 1:
            instrIncrementReg("R0");
            break;

        case 2:
            instrDecrementReg("R0");
            break;

        case 3:
            instrIncrementReg("R1");
            break;

        case 4:
            instrDecrementReg("R1");
            break;
        
        case 5:
            instrSwapRegs("R0", "R1");
            break;
        
        case 6:
            ringBell();
            break;
        
        case 7:
            writeToPrinter(getRegister("R0"));
            break;

        case 8:
            instrJumpIfnotZ("R0");
            break;

        case 9:
            instrJumpIfZ("R0");
            break;
    }
}
/*** 4004 Instruction Set ***/
function instruction4004(inst) {
    switch (inst) {
        case 1:
            instrIncrementReg("R0");
            break;

        case 2:
            instrDecrementReg("R0");
            break;

        case 3:
            instrIncrementReg("R1");
            break;

        case 4:
            instrDecrementReg("R1");
            break;
        
        case 5:
            instrAddRegs("R0", "R1");
            break;
        
        case 6:
            instrSubtractRegs("R0", "R1");
            break;
        
        case 7:
            writeToPrinter(getRegister("R0"));
            break;

        case 8:
            instrJumpIfnotZ("R0");
            break;

        case 9:
            instrJumpIfZ("R0");
            break;

        case 10:
            setRegister("R0", data);
            break;

        case 11:
            setRegister("R1", data);
            break;

        case 12:
            setMemory(data, getRegister("R0"));
            break;

        case 13:
            setMemory(data, getRegister("R1"));
            break;
        
        case 14:
            instrSwapRegData("R0");
            break;

        case 15:
            instrSwapRegData("R1");
            break;
    }
}

/*** 8008 Instruction Set ***/
function instruction8008(inst) {
    switch (inst) {
        case 1:
            instrIncrementReg("R0");
            break;

        case 2:
            instrDecrementReg("R0");
            break;

        case 3:
            instrIncrementReg("R1");
            break;

        case 4:
            instrDecrementReg("R1");
            break;
        
        case 5:
            instrAddRegs("R0", "R1");
            break;
        
        case 6:
            instrSubtractRegs("R0", "R1");
            break;
        
        case 7:
            writeToPrinter(getRegister("R0"));
            break;

        case 8:
            instrJumpIfnotZ("R0");
            break;

        case 9:
            instrJumpIfZ("R0");
            break;

        case 10:
            setRegister("R0", data);
            break;

        case 11:
            setRegister("R1", data);
            break;

        case 12:
            setMemory(data, getRegister("R0"));
            break;

        case 13:
            setMemory(data, getRegister("R1"));
            break;
        
        case 14:
            instrSwapRegData("R0");
            break;

        case 15:
            instrSwapRegData("R1");
            break;
        
        case 16:
            ringBell();
            break;
        
        case 17:
            writeAsciiToPrinter(getRegister("R0"));
            break;
    }
}

/*** 4917 Instruction Set ***/
function instruction4917(inst) {
    switch (inst) {
        case 1:
            // R0 = R0 + R1
            instrAddRegs("R0", "R1");
            break;

        case 2:
            // R0 = R0 - R1
            instrSubtractRegs("R0", "R1");
            break;

        case 3:
            // R0 = R0 + 1
            instrIncrementReg("R0");
            break;

        case 4:
            // R1 = R1 + 1
            instrIncrementReg("R1");
            break;

        case 5:
            // R0 = R0 - 1
            instrDecrementReg("R0");
            break;

        case 6:
            // R1 = R1 - 1
            instrDecrementReg("R1");
            break;

        case 7:
            // Ring bell
            ringBell();
            break;

        // 2-byte instructions
        // Data is stored in the 'data' global variable
        case 8:
            // Print 'data'
            writeToPrinter(data);
            break;

        case 9:
            // Load 'data' into R0
            setRegister("R0", data);
            break;

        case 10:
            // Load 'data' into R1
            setRegister("R1", data);
            break;

        case 11:
            // Store R0 at 'data'
            setMemory(data, getRegister("R0"));
            break;

        case 12:
            // Store R1 at 'data'
            setMemory(data, getRegister("R1"));
            break;

        case 13:
            // Jump to 'data'
            instrJump();
            break;

        case 14:
            // Jump to 'data' if R0 = 0
            instrJumpIfZ("R0")
            break;

        case 15:
            // Jump to 'data' if R0 != 0
            instrJumpIfnotZ("R0")
            break;
    }
}