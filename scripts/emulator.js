/*
 * Implementation of the Emulator
 *
 */

/****************
 * FRONT END UI *
 ****************/
var emu_data = null;

async function getJson() {
    const response = await fetch('./config/4917.json', {});
    const json = await response.json();

    return json;
}

window.addEventListener("load", (event) => {
    getJson().then(json => {
        console.log(json);
        emu_data = json;
        documentSetup();
    })
});

function documentSetup() {
    // Set up page
    document.title = emu_data.name;
    document.getElementById("h1-title").innerHTML = emu_data.name + " Microprocessor";

    emu_data.sysRegisters.forEach(function (item) {
        var newRow = document.getElementById("sys-registers").insertRow();
        newRow.innerHTML = "<th>" + item + "</th>"
        newRow.innerHTML += "<td id=sysr-" + item + ">0</td>"
    })

    emu_data.gpRegisters.forEach(function (item) {
        var newRow = document.getElementById("gp-registers").insertRow();
        newRow.innerHTML = "<th>" + item + "</th>"
        newRow.innerHTML += "<td id=gpr-" + item + ">0</td>"
    })

    emu_data.instructions.forEach(function (item) {
        var newRow = document.getElementById("instructions").insertRow();
        var cell0 = newRow.insertCell();
        var cell1 = newRow.insertCell();
        var cell2 = newRow.insertCell();
        cell0.innerHTML = item[0]
        cell1.innerHTML = "<code>" + item[1] + "</code>"
        cell2.innerHTML = item[2]
    })
}

function changeRunState(CPUisRunning) {
    if (CPUisRunning) {
        buttonStop.disabled = false;
        buttonRun.disabled = true;
        buttonStep.disabled = true;

        input_list = document.getElementsByTagName("input")
        for (var i = 0; i < input_list.length; i++) {
            input_list[i].disabled = true;
        }
    } else {
        buttonStop.disabled = true;
        buttonRun.disabled = false;
        buttonStep.disabled = false;

        input_list = document.getElementsByTagName("input")
        for (var i = 0; i < input_list.length; i++) {
            input_list[i].disabled = false;
        }
    }
}

/* Button Event Handlers */
const buttonStop = document.getElementById("button-stop");
const buttonRun  = document.getElementById("button-run");
const buttonStep = document.getElementById("button-step");
const buttonSave = document.getElementById("button-save");
const buttonLoad = document.getElementById("button-load");

buttonStop.addEventListener("click", (event) => {
    changeRunState(false)
});

buttonRun.addEventListener("click", (event) => {
    changeRunState(true)
});

buttonStep.addEventListener("click", (event) => {
});

buttonSave.addEventListener("click", (event) => {
    // Get all memory values as array
    var memory_export = [];
    for (let i = 0; i < emu_data.memSize; i++) {
       memory_export.push(getMemory(i)); 
    }

});

buttonLoad.addEventListener("click", (event) => {
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
function getMemory(addr) {
    memString = document.getElementById(memToId(addr)).value;
    memValue = parseInt(memString, 16);
    return memValue
}

function setMemory(addr, value) {
    document.getElementById(memToId(addr)).innerHTML = value.toString(16);
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

/*************
 * EMULATOR  *
 *************/