Messages = new Mongo.Collection("msgs");

//This code only runs on the server
if (Meteor.isServer) {

  //Emoji support
  Meteor.publish('emojis', function() {
    return Emojis.find();
  });

  Meteor.publish("messages", function () {
    return Messages.find({}, {sort: {createdAt: -1}, limit: 10, transform: function(doc) {
      if(doc.message) doc.message = Meteor.call('urlify', doc.message)          
        return doc;
    }});
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
      var maxlength = 550;
      //if message is longer than 550 it gets cut      
      if (message.length > maxlength){
        message = message.substring(0, maxlength);
      }      
      var entryLite = {a: message, b: Meteor.user().username}
      var parsedData = JSON.stringify(entryLite);    
      sendToSerialPort(parsedData); 
      var clickable = Meteor.call('urlify', message);
      console.log(clickable)  ;
      var entry = {messageText: clickable,
        createdAt: new Date(),
        username: Meteor.user().username};
      Messages.insert(entry);     
      console.log(entryLite);
    },
    //method for recieveing a message
    receiver: function(message) {
      console.log(message);
      try {
        var parsed = JSON.parse(message);
      } catch(e) {        
        parsed = JSON.parse("{\"a\":\"Message failed. JSON cannot be parsed.\", \"b\":\"System Message\"}");
      }
      var urlified = Meteor.call('urlify', parsed.a)   
      var entry = {messageText: urlified,
        createdAt: new Date(),
        username: parsed.b};      
      Messages.insert(entry);
    },
    //method to urlify messages using regular expressions
    urlify: function(text) {      
      console.log("urlyifying");
    var urlRegex =/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
      return text.replace(urlRegex, function(url) {
          return '<a href="' + url + '" target="_blank">' + url + '</a>';
      })
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
    }
  });

  Tracker.autorun(function() {
    Messages.find().observeChanges({
      added: function() {
        var objDiv = document.getElementById("message-window");
        objDiv.scrollTop = objDiv.scrollHeight;
      }
    });
  });

  /*events*/
  Template.body.events({
    "submit .new-message": function (event) {
      var text = event.target.text.value;

      Meteor.call("sendMessage", text);

      event.target.text.value = "";
      event.preventDefault();
    }
  });

  /*account config*/
  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}
