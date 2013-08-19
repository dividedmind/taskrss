Compile
=======

Generic Express.js/Connect middleware handling runtime compilization tasks.

Feature
-------

* Compile source file on requested

* Cache the compiled data for next request

* Watch for source file changes

  Once the source file is changed, cache is invalidated.

* Dependency Supplement interface

  Add extra dependency files to watch

* Support JSONP request

  Support request with `GET /api?callback=?`

Usage
-----

```javascript
var compile = require('compile-middleware');
var midware = {
  less: compile({
    filename  : function (req) {            // Source filename resolve
                  // Function obtaining filename 
                },
    src       : '/path/to/source',          // Path to source file
    render    : function (source_path, cb, depend) {
                  // Function render file 
                },
  }),
  jade: compile({
    filename  : /(?:\/runtime\/)(.*)\.js/i, // Capture group 1 will be used
    src_ext   : '.jade',                    // Optional, Default ''
    src       : '/path/to/source',
    render    : function (source_path, cb) {
                  // Function rendering file
                },
    headers   : {                           // Optional, HTTP Headers
                  'Cache-Control': 'public, max-age=86400',
                  'Content-Type': 'text/javascript' 
                }
  })
};

app.use(midware.less);
app.use(midware.jade);
```

When render function issue an `ENOENT` error. The middleware will invoke the
`next()` function for other middleware to execute. 

_Thus, put this middleware before `express.static` middleware is recommended 
practice._

Render Function Arguments: 

* **source_path**

  path to the file to be rendered, file path be made from `src`, 
  `filename` expression and `src_ext` parameter.

* **cb**

  callback function, invoke `cb(err)` on error, `cb(null, <data>)` on
  success

* **depend** (Optional)

  You can add extra dependency by calling `depend("/path/to/extra/depend")`
  or `depend(["list/of", "extra/depend", "files"])`

  *The change on depended file will also invalidate the compiled cache*

Either a function or Regular Expression is accepted as filename parameter.
When using RegEx, the first capture group will be used as the name of source
file. A suffix to filename can be defined by `src_ext`.

**WARNING** No not add a `g` flag to the RegExp, that will broke the 
filename extraction procedure. It's an
[V8 Issue](https://code.google.com/p/v8/issues/detail?id=778)

Related Works
-------------

* [Compile-Middleware for Jade-Runtime](http://github.com/shinohane/compile-mw-jade-runtime)

* [Compile-Middleware for LESS](http://github.com/shinohane/compile-mw-less)

License
-------

Copyright 2013 Shinohane&lt;imandry.c@gmail.com&gt;

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and 
limitations under the License.

