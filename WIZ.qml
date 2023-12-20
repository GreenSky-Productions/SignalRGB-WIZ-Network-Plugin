Item {
    anchors.fill: parent

    Rectangle{
        anchors{
            top: parent.top
            right: parent.right
        }
        width: 300
        height: linkingCol.childrenRect.height + linkingCol.topPadding + linkingCol.bottomPadding
        color: theme.background3
        radius: theme.radius
        Column{
            id: linkingCol
            spacing: 5
            padding: 10
            width: parent.width

            Label{
                font{
                    pixelSize: 16
                    family: theme.primaryfont
                    weight: Font.Bold
                }
                color: theme.primarytextcolor
                text: "Linking Instructions"
            }
            Label{
                font{
                    pixelSize: 14
                    family: theme.secondarytextcolor
                }
                width: parent.width - 20
                color: theme.secondarytextcolor
                textFormat: Text.MarkdownText
                wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                text: 
"* The Device must be on a 2.4ghz WIFI network. \n
* The local udp network communication must be active."
            }

        }
    }

    Column{
        width: parent.width
        height: parent.height
        spacing: 10

		Rectangle{
			id: scanningItem
			height: 50
			width: childrenRect.width + 15
			visible: service.controllers.length === 0
			color: theme.background3
			radius: theme.radius

			BusyIndicator {
				id: scanningIndicator
				height: 30
				anchors.verticalCenter: parent.verticalCenter
				width: parent.height
				Material.accent: "#88FFFFFF"
				running: scanningItem.visible
			}  

			Column{
				width: childrenRect.width
				anchors.left: scanningIndicator.right
				anchors.verticalCenter: parent.verticalCenter

				Text{
					color: theme.secondarytextcolor
					text: "Searching network for WIZ Devices..." 
					font.pixelSize: 14
					font.family: "Montserrat"
				}
				Text{
					color: theme.secondarytextcolor
					text: "This may take several minutes..." 
					font.pixelSize: 14
					font.family: "Montserrat"
				}
			}
		}
    
        Repeater{
            model: service.controllers          

            delegate: Item {
                id: root
                width: 350
                height: content.height
                property var device: model.modelData.obj

                Rectangle {
                    width: parent.width
                    height: parent.height
                    color: Qt.lighter(theme.background2, 1.3)
                    radius: 5
                }

                Column{
                    id: content
                    width: parent.width
                    padding: 15
                    spacing: 5

                    Row{
                        width: parent.width
                        height: childrenRect.height

                        Column{
                            id: leftCol
                            width: 260
                            height: childrenRect.height
                            spacing: 5

                            Text{
                                color: theme.primarytextcolor
                                text: device.modelName
                                font.pixelSize: 16
                                font.family: "Poppins"
                                font.weight: Font.Bold
                            }

                            Row{
                                spacing: 5
                                Text{
                                    color: theme.secondarytextcolor
                                    text: "Id: " + device.id
                                }

                                Text{
                                    color: theme.secondarytextcolor
                                    text: "|"
                                }

                                Text{
                                    color: theme.secondarytextcolor
                                    text: "Room ID: " + device.roomid
                                }  
                            }

                            Row{
                                spacing: 5
                                Text{
                                    color: theme.secondarytextcolor
                                    text: "Ip Address: " + (device.ip != "" ? device.ip : "Unknown")
                                }

                                Text{
                                    color: theme.secondarytextcolor
                                    text: "|"
                                }

                                Text{
                                    color: theme.secondarytextcolor
                                    text: "Firmware Version: " + device.fwVersion
                                }  
                            }

                            Text{
                                color: theme.secondarytextcolor
                                text: `Supports DreamView Protocol: `
                            }

                            Text{
                                color: theme.secondarytextcolor
                                text: ``
                            }

                            // Text{
                            //     color: theme.warn
                            //     width: parent.width
                            //     visible: false
                            //     wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                            //     text: `This device doesn't support Govee's Razer, or Dreamview protocols. SignalRGB is unable to control it...`
                            // }

                        }

                    }
                }
            }  
        }
    }
}