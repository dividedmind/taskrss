var env = process.env.NODE_ENV || 'dev';

var fs = require('fs');
var express = require('express');
var jade = require('jade');
var googleapis = require('googleapis');
var crypto = require('crypto');
var rss = require('rss');
var async = require('async');
var compile = require('compile-middleware');

var firebase = new(require('firebase'))(process.env.FIREBASE_URL);
var tokenGenerator = new(require("firebase-token-generator"))(process.env.FIREBASE_SECRET);
var token = tokenGenerator.createToken({ app: "taskrss" }, { debug: env == 'dev' });
firebase.auth(token, function(error) {
  if(error)
    console.log("Firebase login failed! " + error);
});

var app = express();

app.use(express.logger());
app.use(express.compress());
app.use(express.cookieParser());
app.set("views", "templates");
app.set("view engine", "jade");
app.locals.title = "Taskrss";
app.locals.tagline = "Google Tasks to RSS bridge";

var less = require('less').Parser;

function render_less(filename, cb)
{
  function return_tree(err, tree) {
    cb(err, tree);
  };
  
  function parse(err, content) {
    if (err)
      return cb(err, undefined);
    
    var options = { filename: filename, paths: ["templates"] };
    var parser = new(less)(options);
  
    parser.parse(content, return_tree);
  };
  
  fs.readFile(filename, 'utf8', parse);
}

app.use(compile({ filename: /(.*)\.css/i,
  src_ext: '.less',
  src: 'styles',
  render: render_less,
  headers: { 'Content-Type': 'text/css' }
}));

app.use(function(err, req, res, next) {
  console.log(err.stack);
  res.send(500, 'Something broke!');
});

function setup_feeds(req, res)
{
  var refresh_token = req.cookies.refresh_token;
  var access_token = req.cookies.access_token;
  
  var hash = crypto.createHash("md5").update(refresh_token).digest('hex');
  
  var data = firebase.child(hash);
  data.child('refresh_token').set(refresh_token);
  if (access_token)
    data.child('access_token').set(access_token);
  
  res.locals.feed_new = base_url(req) + "/tasks/" + hash + "/new";
  res.locals.feed_done = base_url(req) + "/tasks/" + hash + "/completed";
}

function get_root(req, res)
{
  res.setHeader('Content-Type', 'text/html');
  var template = "frontpage";
  if (req.cookies.refresh_token) {
    setup_feeds(req, res);
    template = "feeds";
  }
  
  function send(err, html) {
    if (err) {
      console.log(err.stack);
      res.send(500, "broken");
      return;
    }
    
    res.send(html);
  };
  
  res.render(template, send);
}

app.get('/', get_root);

var port = process.env.PORT || 5000;

var oauth2client_ = undefined;

function base_url(req) {
  var host = req.host;
  if (host === "localhost")
    host += ":5000";
  return req.protocol + '://' + host;
}

function oauth2client(req)
{
  if (!oauth2client_) {
    var callback_url = base_url(req) + "/oauth2callback";
    oauth2client_ = new googleapis.OAuth2Client(process.env.G_CLIENT_ID, process.env.G_CLIENT_SECRET, callback_url);
  }
  return oauth2client_;
}

function get_login(req, res)
{
  var client = oauth2client(req);
  var url = client.generateAuthUrl({ access_type: 'offline', 
                                scope: 'https://www.googleapis.com/auth/tasks.readonly',
                                approval_prompt: 'force' });
  res.redirect(url);
}
app.get('/login', get_login);

function get_oauth2callback(req, res)
{
  function handleToken(err, token) {
    if (err) {
      console.log(err.stack);
      res.send(500, "broken");
      return;
    }
    
    res.cookie('access_token', token.access_token, { maxAge: token.expires_in * 1000, httpOnly: true });
    res.cookie('refresh_token', token.refresh_token, { maxAge: 3e10, httpOnly: true });
    res.redirect('/');
  }
  var client = oauth2client(req);
  client.getToken(req.query.code, handleToken);
}
app.get('/oauth2callback', get_oauth2callback);

function get_feed(req, res)
{
  var user, o2c, client;
  
  if (req.params.kind !== "new" && req.params.kind !== "completed")
    return res.status(404).send("no such feed");
  
  var feed = new rss({ title: req.params.kind + " tasks",
                  feed_url: base_url(req) + req.path,
                  site_url: base_url(req)
                  });
  var completed = req.params.kind === "completed";
  
  var common_params = {
    fields: "items(completed,id,status,title,updated,selfLink)",
    showHidden: completed,
    showDeleted: completed
  };
  
  var lists_left = 0;
  
  function send_error(err) {
    console.log(err.stack);
    res.send(500, "broken");
  }
  
  function maybe_send_result(err) {
    if (err) return send_error(err);
    if (!--lists_left) {
      res.setHeader('Content-Type', 'application/rss+xml');
      res.send(feed.xml(env == 'dev'));
    }
  }
  
  function build_item(item, cb) {
    var data = { guid: item.id,
          title: item.title,
          url: item.selfLink };
    if (completed) {
      if (item.status === "completed") {
        data.date = item.completed;
        feed.item(data);
      }
    } else {
      data.date = item.updated;
      feed.item(data);
    }
    cb();
  }
  
  function handle_list(err, list) {
    if (err) return send_error(new Error(err.message));
    async.each(list.items, build_item, maybe_send_result);
  }
  
  function get_list(list) {
    var params = new Object(common_params);
    params.tasklist = list.id;
    client.tasks.tasks.list(params).withAuthClient(o2c).execute(handle_list);
  }
  
  function handle_lists(err, lists) {
    if (err) return send_error(err);
    lists_left = lists.items.length;
    async.each(lists.items, get_list);
  }
  
  function handle_client(err, client_) {
    if (err) return send_error(err);
    client = client_;
    client.tasks.tasklists.list().withAuthClient(o2c).execute(handle_lists);
  }
  
  function handle_user(data) {
    user = data.val();
    if (!user)
      return res.status(404).send("no such user. Reauthenticate?");
    
    o2c = oauth2client(req);
    o2c.credentials = { access_token: user.access_token, refresh_token: user.refresh_token };
    googleapis.discover('tasks', 'v1').execute(handle_client);
  }
  firebase.child(req.params.hash).once("value", handle_user);
}
app.get('/tasks/:hash/:kind', get_feed);

app.listen(port);

console.log("Listening on port " + port);
