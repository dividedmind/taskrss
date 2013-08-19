var path = require('path');
var Gaze = require('gaze').Gaze;

var compile = function (options) {
    options = options || {};
    var filename = options.filename;
    var src_ext = options.src_ext || '';
    var src = options.src;
    var render = options.render;
    var headers = options.headers || {};
    if(typeof src != 'string') 
        throw new Error('src path string is expected');
    if(typeof render != 'function')
        throw new Error('render function is expected');
    if(filename instanceof RegExp) {
        var regex = filename;
        filename = function (req) {
            var match = regex.exec(req.path);
            return match && match[1];
        };
    }
    if(typeof filename != 'function')
        throw new Error('filename RegExp or function is expected');

    var resolve = path.resolve;

    // Map: Filename -> Compile Result
    var cache = {};

    // Forward Map: Filename -> [ Depender ]
    // Backward Map: Depender -> [ Filename ]
    var dependency = {
        forward: {},
        backward: {},
    };

    // FIXME Cannot initialize Gaze without arguments
    var gaze = new Gaze('nothing', function () {
        
        this.on('all', function (event, path) {
            // Remove cache file delete cache[path];
            var targets = dependency.forward[path] || [];
            for(var i = targets.length - 1; i >= 0; i--) {
                var target = targets[i];
                if(dependency.backward[target].indexOf(path) == -1) {
                    delete targets[i];
                }else{
                    delete cache[target];
                }
            }
        });

    }); 

    var respond = function (req, res, next, data) {
        if(data instanceof Function) {
            // invoke the function as respond
            data(req, res, next);
        }else{
            res.writeHead(200, headers);
            if(req.query && req.query.callback) {
                // JSONP request
                res.end(';' + req.query.callback + '(' + data + ');');
            }else{
                res.end(data);
            }
        }
    };

    var middleware = function (req, res, next) {

        if ('GET' != req.method.toUpperCase() && 
            'HEAD' != req.method.toUpperCase()) { 
            return next(); 
        }

        var name = filename(req);
        if(name) {
            var file = resolve(path.join(src, name + src_ext));
            var built = cache[file];
            if(built) {
                return respond(req, res, next, built);
            } else {
                var deps = [ file ];
                render(file, function(err, content) {
                    if(err) {
                        if('ENOENT' == err.code) {
                            // File not found
                            // Fallback to following middleware
                            content = function (req, res, next) {
                                return next();
                            };
                        }else{
                            return next(err);
                        }
                    }
                    built = cache[file] = content;
                    // Update backward map
                    dependency.backward[file] = deps;
                    deps.forEach(function (dep) {
                        dependency.forward[dep] = dependency.forward[dep] || [];
                        if(dependency.forward[dep].indexOf(file) == -1) {
                            dependency.forward[dep].push(file);
                        }
                        if(gaze._patterns.indexOf(dep) === -1) {
                            // If not watched
                            gaze.add(dep, function () { 
                                // Gaze Added
                            });
                        }
                    });
                    return respond(req, res, next, built);
                }, function (dependency) {
                    // Dependency Register
                    if(typeof dependency == 'string') {
                        dependency = [ dependency ];
                    }
                    if(Array.isArray(dependency)) {
                        dependency.forEach(function (dep) {
                            if(deps.indexOf(dep) == -1) {
                                deps.push(dep);
                            }
                        });
                    } 
                });
            }
        }else{
            return next();
        }

    };

    middleware.close = gaze.close;
    middleware.cache = cache;

    return middleware;
};

module.exports = compile;
