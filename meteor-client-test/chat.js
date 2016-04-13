Messages = new Mongo.Collection("msgs");



if (Meteor.isServer) {
  // This code only runs on the server
  //emoji support
  Meteor.publish('emojis', function() {
    // Here you can choose to publish a subset of all emojis
    // if you'd like to.
    return Emojis.find();
  });
  Meteor.publish("messages", function () {
    return Messages.find({}, {sort: {createdAt: -1}, limit: 5});
  });
  //parameters for serialPort
  var serialPort = new SerialPort.SerialPort('/dev/cu.usbmodem1421', {
    baudrate: 9600,
    parser: SerialPort.parsers.readline('\r\n')
  });
  //tests serial connection
  serialPort.on('open', function() {
    console.log('Port open');
  });
  //monitors incoming messages
  serialPort.on('data', Meteor.bindEnvironment(function(data) {
    Meteor.call('receiver', data);  
  }));

  //sending message function
  sendToSerialPort = function(message) {
    serialPort.write(message + '\r');
  };
  Meteor.methods({
    //method for sending a message  
    sendMessage: function (message) {
      if (! Meteor.userId()) {
        throw new Meteor.Error("not-authorized");
      }
      var entryLite = {a: message, b: Meteor.user().username}
      var parsedData = JSON.stringify(entryLite);    
      sendToSerialPort(parsedData);
      var entry = {messageText: message,
        createdAt: new Date(),
        username: Meteor.user().username};
      Messages.insert(entry);     
      console.log(entryLite);


    },
    //method for recieveing a message
    receiver: function(message) {
      //console.log(message);
      try {
        var parsed = JSON.parse(message);
      } catch(e) {
        parsed = JSON.parse("{\"a\":\"Message failed. JSON cannot be parsed.\", \"b\":\"System Message\"}");
      }   
      var entry = {messageText: parsed.a,
        createdAt: new Date(),
        username: parsed.b};      
      Messages.insert(entry);
    }
  });
}


  
/* scrolling code */

if (Meteor.isClient) {
  //subscribing to emojis on client
  Meteor.startup(function() {
    Meteor.subscribe('emojis');
  });
  // This code only runs on the client
  Meteor.subscribe("messages");
  /* helper code */
  Template.body.helpers({
    recentMessages: function () {
      return Messages.find({}, {sort: {createdAt: 1}});
    },
    /* unread message helper */
  });

  /*chat window scrolling*/

  /*events*/
  Template.body.events({
    "submit .new-message": function (event) {
      var text = event.target.text.value;

      Meteor.call("sendMessage", text);

      event.target.text.value = "";
      event.preventDefault();
    },

    /* scroll event */
    
    /* more messages event */

  });

  /*account config*/
  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}
