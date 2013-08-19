
var express = require('express');
var request = require('supertest');
var path = require('path');
var should = require('should');
var assert = require('assert')
  , AssertionError = assert.AssertionError;


describe('Compile-middleware', function () {

    var compile = require('../index');
    var expected_path = null;
    var include_test = false;

    var test = compile({
        filename  : /(?:\/runtime\/)(.*).js/i,
        src_ext   : '.jade',
        src       : 'test/',
        render    : function (source_path, cb, depend) {
            // Function rendering file
            if(expected_path)
                source_path.should.equal(expected_path);
            if(include_test) 
                depend(path.resolve(__dirname + '/include.jade'));
            setTimeout(cb.bind(this, null, "Hey!"), 1000);
        },
        headers   : {
            'Cache-Control': 'public, max-age=86400',
            'Content-Type': 'text/javascript' 
        }
    });

    should.not.invoked = function () {
        throw new AssertionError({
            message: 'function is expected not to be reached',
            stackStartFunction: should.not.invoked
        });
    };

    it('should done if request does not match', function (done) {
        test({
            method: 'GET', 
            path: '/js/jquery.js'
        }, {
            writeHead: should.not.invoked,
            end: should.not.invoked
        },
        done);
    });

    it('should compile when requested file pattern matched', function (done) {
        expected_path = path.resolve(__dirname + '/chatmsg.jade');
        test({
            method: 'GET', 
            path: '/runtime/chatmsg.js'
        }, {
            writeHead: function (code, headers) {
                code.should.equal(200);
                should.exist(headers);
            },
            end: function (data) {
                data.should.equal('Hey!');
                done();
            }
        },
        should.not.invoked);
    });

    it('should have cached result after first requested', function () {
        test.cache.should.have.property(expected_path);
        test.cache[expected_path].should.equal('Hey!');
    });

    var fs = require('fs');

    it('should invalidate cache after source file changed', function (done) {
        var data = fs.readFileSync(expected_path);
        fs.writeFileSync(expected_path, data);
        setTimeout(function () {
            test.cache.should.not.have.property(expected_path);
            done();
        }, 200);
    });

    it('should compile and cache given a file with "include"', function (done) {
        include_test = true;
        expected_path = path.resolve(__dirname + '/chatmsg.jade');
        test({
            method: 'GET', 
            path: '/runtime/chatmsg.js'
        }, {
            writeHead: function (code, headers) {
                code.should.equal(200);
                should.exist(headers);
            },
            end: function (data) {
                data.should.equal('Hey!');
                test.cache.should.have.property(expected_path);
                test.cache[expected_path].should.equal('Hey!');
                done();
            }
        },
        should.not.invoked);
    });

    it('should invalidate cache after included file changed', function (done) {
        var data = fs.readFileSync(path.resolve(__dirname + '/include.jade'));
        fs.writeFileSync(path.resolve(__dirname + '/include.jade'), data);
        setTimeout(function () {
            test.cache.should.not.have.property(expected_path);
            done();
        }, 200);
    });

    it('should compatible with JSONP mode', function (done) {
        include_test = true;
        expected_path = path.resolve(__dirname + '/chatmsg.jade');
        test({
            method: 'GET', 
            path: '/runtime/chatmsg.js',
            query: {
                callback: 'define',
            }
        }, {
            writeHead: function (code, headers) {
                code.should.equal(200);
                should.exist(headers);
            },
            end: function (data) {
                data.should.equal(';define(Hey!);');
                done();
            }
        },
        should.not.invoked);
    });

    describe('express.js', function () {

        before(function () {
            app = express();
            app.use(express.static(__dirname))
            app.get('/', function (req, res, next) {
                res.send(req.query.text);
            });
        });

        var app;

        it('should parse query', function (done) {
            request(app)
            .get('/?text=TESTTEXT')
            .expect(200)
            .expect('TESTTEXT')
            .end(done);
        });

        it('should fallback when possible', function (done) {
            request(app)
            .get('/runtime/fallback.js')
            .expect(200)
            .end(done);
        });
    });

});
