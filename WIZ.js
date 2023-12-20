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
	device.addFeature("udp");
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

export function Image(){
	return "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"
}