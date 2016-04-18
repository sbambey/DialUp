Messages = new Mongo.Collection("msgs");

//Router routes web requests to the appropriate template - for this application we only have the landing page and the chat interface
Router.route('/', function () {
  this.render('home');
});
Router.route('/chat');

//This code only runs on the server
if (Meteor.isServer) {

  //Emoji support
  Meteor.publish('emojis', function() {
    return Emojis.find();
  });

  //Publishes messages
  Meteor.publish("messages", function () {
    return Messages.find({}, {sort: {createdAt: -1}, limit: 10, transform: function(doc) {
      if(doc.message) doc.message = Meteor.call('urlify', doc.message)          
        return doc;
    }});
  });
  //Parameters for serialPort library that is used for any serial connection use
  var serialPort = new SerialPort.SerialPort('/dev/cu.usbmodem1411', {
    baudrate: 9600,
    parser: SerialPort.parsers.readline('\r\n')
  });

  //Opens serial connection for test
  serialPort.on('open', function() {
    console.log('Port open');
  });

  //Monitors incoming messages
  serialPort.on('data', Meteor.bindEnvironment(function(data) {
    Meteor.call('receive', data);  
  }));

  //Sends message over serial port, delimited by a carriage return 
  sendToSerialPort = function(message) {
    serialPort.write(message + '\r');
  };
  Meteor.methods({
    
    //sendMessage(): Sends message over serial connection to embedded system
    sendMessage: function (message) {
      if (! Meteor.userId()) {
        throw new Meteor.Error("not-authorized");
      }

      //if message is longer than 550 it gets cut
      var maxlength = 550;      
      if (message.length > maxlength){
        message = message.substring(0, maxlength);
      }
      var entryLite = {a: message, b: Meteor.user().username}
      var parsedData = JSON.stringify(entryLite);       //JSON encode 
      sendToSerialPort(parsedData);                     //Send over serial
      var clickable = Meteor.call('urlify', message);   //URLify message
      var entry = {messageText: clickable,
        createdAt: new Date(),
        username: Meteor.user().username};
      Messages.insert(entry);                           //Add message to database on sending end  
    },

    //receive(): Parses an incoming message and adds it to the database
    receive: function(message) {
      try {
        var parsed = JSON.parse(message);
      } catch(e) {
        //Message is not in proper JSON format and arrived faulty        
        parsed = JSON.parse("{\"a\":\"Message failed. JSON cannot be parsed.\", \"b\":\"System Message\"}");
      }
      var urlified = Meteor.call('urlify', parsed.a)    //Urlify any URLs
      var entry = {messageText: urlified,
        createdAt: new Date(),
        username: parsed.b};   
      Messages.insert(entry);                           //Add message to database on receiving
    },

    //urlify(): Detects a URL by regex and returns the html tag for the given link
    urlify: function(text) {      
      console.log("urlyifying");
      var urlRegex =/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
      return text.replace(urlRegex, function(url) {
          return '<a href="' + url + '" target="_blank">' + url + '</a>';
      })
    }   
  });
}

//This code only runs on the client
if (Meteor.isClient) {

  //Subscribing to emojis on client
  Meteor.startup(function() {
    Meteor.subscribe('emojis');
  });

  //Subscribing to messages
  Meteor.subscribe("messages");
  
  //Chat helpers
  Template.chat.helpers({
    //Lists recent messages
    recentMessages: function () {
      return Messages.find({}, {sort: {createdAt: 1}});
    }
  });

  //Autoscroll on receival of new message
  Tracker.autorun(function() {
    Messages.find().observeChanges({
      added: function() {
        var objDiv = document.getElementById("message-window");
        objDiv.scrollTop = objDiv.scrollHeight;
      }
    });
  });

  Template.chat.events({
    //Event that fires when new message is submitted, triggering the sendMessage function on the server
    "submit .new-message": function (event) {
      var text = event.target.text.value;

      Meteor.call("sendMessage", text);

      event.target.text.value = "";
      event.preventDefault();
    }
  });

  //Account config
  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}
