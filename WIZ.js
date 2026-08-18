export function Name() { return "WIZ Interface"; }
export function Version() { return "1.0.0"; }
export function VendorId() { return    0x0; }
export function ProductId() { return   0x0; }
export function Type() { return "network"; }
export function Publisher() { return "GreenSky Productions"; }
export function Size() { return [1, 1]; }
export function DefaultPosition() {return [75, 70]; }
export function DefaultScale(){return 10.0;}
/* global
controller:readonly
discovery: readonly
TurnOffOnShutdown:readonly
variableLedCount:readonly
*/

//Code Example from https://gitlab.com/signalrgb/Govee/-/blob/main/Govee.js
//Info about the Protocol of WIZ from https://github.com/SRGDamia1/openhab2-addons/blob/025b9739935b6ea87ecba6cf02c417d0434873e1/bundles/org.openhab.binding.wizlighting/src/main/java/org/openhab/binding/wizlighting/internal/enums/WizLightingMethodType.java

export function ControllableParameters() {
	return [
		{"property":"AutoStartStream", "group":"settings", "label":"Automatically Start Stream", "type":"boolean", "default":"false"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color", "min":"0", "max":"255", "type":"color", "default":"#009bde"},
		{"property":"minBrightniss", "group":"lighting", "label":"Minimal Brightniss", "min":"1", "max":"100", "type":"hue", "default":"10"},
		{"property":"dimmColor", "group":"lighting", "label":"Default Color when dimmed", "min":"0", "max":"255", "type":"color", "default":"#010101"},
		{"property":"forceColor", "group":"settings", "label":"Force Color", "type":"boolean", "default":"false"},

	];
}

export function DefaultComponentBrand() { return "WIZ";}

export function SubdeviceController() { return false; }

/** @type {WIZProtcol} */
let wizpro;
let ledCount = 4;
let ledNames = [];
let ledPositions = [];
let subdevices = [];
let lastBroadcast = 0;
/*
class WIZController{
	constructor(controller) {
		this.mac = controller.mac;
		this.hostname = controller.hostname;
		this.name = controller.name;
		this.ip = controller.ip;
		this.port = controller.port;
		this.arch = controller.arch;
		this.streamingPort = controller.streamingPort;
		this.deviceledcount = controller.deviceledcount;
	}

	SetupChannel() {
		device.SetLedLimit(this.deviceledcount);
		device.addChannel(this.name, this.deviceledcount);
	}


	SendColorPackets(){
		
	}
}
*/
export function onvariableLedCountChanged(){

}


export function Initialize(){
	device.setName(`WIZ ${controller.modelName} Room: ${controller.roomId}`);
	if(controller.wiztype){
		//device.setIcon(controller.wiztype.imageUrl);
	}	

	device.addProperty({"property": "variableLedCount", label: "Leds", "type": "number", "min": 1, "max": 1, default: 1});
	if(device.isTW){
		device.removeProperty("forcedColor");
		device.removeProperty("forceColor");
	}
	
	device.setSize(1,1);
	device.setControllableLeds(["LED 1"],[[0,0]]);
	device.log(JSON.stringify(controller));
	device.log(controller.ip);
	device.log(controller.port);
	device.log(JSON.stringify(device));
	wizpro = new WIZProtcol(controller.ip,controller.port);


}


export function Render(){
	if(AutoStartStream){
		if(forceColor !== undefined){
			const color = forceColor ? device.createColorArray(forcedColor, 1, "Inline") : device.color(0,0);
			wizpro.setPilot(color[0],color[1],color[2]);
		}
		else{
			const color = device.color(0,0);
			wizpro.setPilot(color[0],color[1],color[2]);
		}
		
		
	}
	
		
}

export function Shutdown(suspend){

}


/** @typedef { {productName: string, imageUrl: string, sku: string, state: number, supportRazer: boolean, supportFeast: boolean, ledCount: number, hasVariableLedCount?: boolean} } WIZDevice */
/** @type {Object.<string, WIZDeviceLibrary>} */
const WIZDeviceLibrary = {
	"ESP03_SHRGB3_01ABI": {
		productName: "WRGB LED Strip",
		imageUrl: "https://www.assets.signify.com/is/image/Signify/WiFi-BLE-LEDstrip-2M-1600lm-startkit-SPP?&wid=200&hei=200&qlt=100",
		sku: 27082,
		state: 1,
		supportRGB: true,
		supportDimming: true,
		supportWhiteColor: true,
		supportCostumLedCount: false,
		ledCount: 1
	},
	127372: {
		productName: "W100 WRGB Light Bulb",
		imageUrl: "https://www.assets.signify.com/is/image/PhilipsLighting/Wi_Fi_BLE_100W_A67_E27_922_65_RGB_1PF_6_S-SPP?wid=200&hei=200&qlt=100",
		sku: 127372,
		state: 1,
		supportRGB: true,
		supportDimming: true,
		supportWhiteColor: true,
		supportCostumLedCount: false,
		ledCount: 1
	}
	
};

export function DiscoveryService() {
	this.Initialize = function(){
		service.log("Initializing Plugin!");
		service.log("Searching for network devices...");
	};

	this.firstRun = true;
	this.IconUrl = "https://play-lh.googleusercontent.com/jhmzIodqBLQQUD2sJF_O6oawa04ocDFfQIgoH0rPOXQY3V1uVz0-FJvEieFjVO-kcJ8=w200-h200-rw";
	this.UdpBroadcastPort = 38899;
	this.UdpBroadcastAddress = "255.255.255.255"; //"239.255.255.250";
	this.UdpListenPort = 38900;

	this.CheckForDevices = function(){
		service.log("Broadcasting device scan...");
		service.broadcast(JSON.stringify({"method":"registration","params":{"phoneMac":"AAAAAAAAAAAA","register":false,"phoneIp":"1.2.3.4","id":"1"}}));
		
	};

	this.Update = function(){
		
		for(const cont of service.controllers){
			cont.obj.update();
		}

		const currentTime = Date.now();
		if(currentTime - lastBroadcast >= 60000) {
			lastBroadcast = currentTime;
			this.CheckForDevices();
		}

	};

	this.Shutdown = function(){

	};

	this.Discovered = function(value) {	

		const packet = JSON.parse(value.response);
		switch(packet.method){
			case `registration`:
				service.log(packet.result);
				if(packet.result.success){
					this.CreateController(value);
				}
				break;
			case `getPilot`:
				const pController = service.getController(value.id);
				if (pController !== undefined){
					pController.updateWithValue(value);
				}
				break;
			case `getSystemConfig`:
				const result = packet.result;
				const sController = service.getController(value.id);
				if (sController !== undefined){
					service.log("Controller found");
					sController.setDeviceInfo(result);
				}
				else{
					service.log(`Controller not found ${value.id}`);
				}
				break;
			case `firstBeat`:
				service.log("First Beat");
				service.log(packet);
				break;

			default:
				service.log(`Unknown methode ${packet.method} response`);
				break;
		}		
		
	};

	this.Removal = function(value){

	};

	this.CreateController  = function(value){
		const controller = service.getController(value.id);
		if (controller === undefined) {
			service.addController(new WIZDevice(value));
			service.log("Added new WIZ Device controller");
		} else {
			service.log("Update WIZ Device controller");
			controller.updateWithValue(value);
		}
	};
}



class WIZDevice{
	constructor(value){
		this.id = value.id;
		this.ip = value.ip;
		this.port = value.port;
		this.initialized = false;
		this.deviceInfoLoaded = false;
		this.announced = false;

		this.wiztype = null;

		//WIZ Device info
		this.homeid = 0;
		this.fwVersion = "0.0.0";
		this.roomid = 0;
		this.groupid = 0;
		this.type = -1;
		this.modelName = "";
		this.isRGB = false;
		this.isTW = false;

		this.lastsend = {
			"r":-1,
			"g":-1,
			"b":-1,
			"brightness":-1,

		}

		this.DumpControllerInfo();
		
	};

	

	DumpControllerInfo(){
		service.log(`id: ${this.id}`);
		service.log(`port: ${this.port}`);
		service.log(`ip: ${this.ip}`);
	};

	updateWithValue(value){
		service.log("Got Value update");
		const data = JSON.parse(value.response);
		service.log(data);
		this.ip = data.ip;
		this.port = data.port;

	};

	setDeviceInfo(data){
		//WIZ Device info
		if(this.deviceInfoLoaded){
			return;
		}
		this.homeid = data.homeid;
		this.fwVersion = data.fwVersion;
		this.roomId = data.roomId;
		this.groupId = data.groupId;
		this.type = data.hasOwnProperty("typeid") ? data.typeid : -1;
		this.modelName = data.moduleName;
		this.isRGB = data.moduleName.includes("RGB");
		this.isTW = data.moduleName.includes("TW");
		this.deviceInfoLoaded = true;
		if(WIZDeviceLibrary.hasOwnProperty(this.modelName)){
			this.wiztype = WIZDeviceLibrary[this.modelName];
		}
		
		service.updateController(this);
	}

	update(){
		if(!this.initialized){
			this.initialized = true;
			service.broadcast(JSON.stringify({"method": "getSystemConfig", "id": 1}),this.ip);
			service.log(`Request Device Info from ${this.ip}`);
		}
		if(this.deviceInfoLoaded && !this.announced){
			service.updateController(this);
			service.announceController(this);
			service.log("Is announced!")
			this.announced = true;
		}

	};

}


class WIZProtcol {

	constructor(ip, port){
		this.ip = ip;
		this.port = port;
		this.lastR = -1;
		this.lastG = -1;
		this.lastB = -1;
		this.lastDimmR = -1;
		this.lastDimmG = -1;
		this.lastDimmB = -1;
		this.lastBrightness = -1;
	}

	setPilot(r,g,b){
		//device.log(`Request Device Info from ${this.ip}`);
		let brightness = device.Brightness;
		const color = device.createColorArray(dimmColor, 1, "Inline");

		if(this.lastR !== r || this.lastG !== g || this.lastB !== b || this.lastBrightness !== brightness || this.lastDimmR !== color[0] || this.lastDimmG !== color[1] || this.lastDimmB !== color[2]){
			this.lastG = g;
			this.lastB = b;
			this.lastR = r;

			this.lastDimmR = color[0];
			this.lastDimmG = color[1];
			this.lastDimmB = color[2];
			
			if(r < 1 && g < 1 && b < 1){
				this.lastBrightness = minBrightniss;
				udp.send(this.ip,this.port,{"method":"setPilot","params":{"r":color[0],"g":color[1],"b":color[2],"dimming":minBrightniss,"speed":100}});
			}
			else{
				this.lastBrightness = brightness;
				udp.send(this.ip,this.port,{"method":"setPilot","params":{"r":r,"g":g,"b":b,"dimming":brightness,"speed":100}});
			}
		}
		
		

	}
}
