// Load modules

var Async = require('async');
var Hoek = require('hoek');
var Mongoose = require('mongoose');

// Declare internals

var internals = {};

if (process.env.PRODUCTION) {
    Mongoose.connect('mongodb://hapi:ptm00000@c278.lighthouse.0.mongolayer.com:10278,c278.lighthouse.1.mongolayer.com:10278/hapi-plugins?replicaSet=set-54ebe690660d07da1a000f09');
}
else {
    Mongoose.connect('mongodb://localhost/hapi_plugins');
}

internals.plugin = new Mongoose.Schema({
    'name': { type: String, required: true },
    'description': { type: String, required: false },
    'version': { type: String, required: true },
    'authors': { type: Array, required: false },
    'license': { type: String, required: false },
    'repository': { type: String },
    'homepage': { type: String },
    'updated_at': { type: Date, default: Date.now },
    'created_at': { type: Date, default: Date.now },
    'keywords': { type: Array },
    'dependencies': { type: Array },
    'dependents': { type: Array },
    'stats': {
        'releases': { type: String },
        'downloads': { type: String },
        'downloads_this_month': { type: String },
        'open_issues': { type: String },
        'pull_requests': { type: String }
    }
});


internals.plugin.statics.get = function(username, callback) {

    return this.find({ username: username }, function (err, result) {

        if (err) {
            return callback(err);
        }

        return callback(null, result[0]);
    });
};


internals.plugin.statics.search = function (queryString, sortString, callback){

    var query = {};
    if (queryString && queryString.length > 0) {
        var pattern = new RegExp(queryString, 'ig');
        query = {
            '$or': [
                {'name': pattern},
                {'description': pattern},
                {'author': pattern},
                {'authors': {
                    '$regex': pattern
                }},
                {'keywords': {
                    '$regex': pattern
                }}
            ]
        };
    }
    var sortOrder = 1;
    var sortBy = sortString || 'name';
    if (sortBy[0] === '-') {
        sortOrder = -1;
        sortBy = sortBy.slice(1);
    }
    var sort = {};
    sort[sortBy] = sortOrder;
    return this.find(query).sort(sort).exec(callback);
};


internals.plugin.statics.createOrUpdate = function(pluginJS, callback) {

    var self = this;
    var pluginObj = internals.pluginJStoObj(pluginJS);
    self.update({ name: pluginObj.name }, pluginObj, function (err, numberAffected, raw) {

        if (numberAffected === 0) {
            var plugin = new self(pluginObj);
            return plugin.save(callback);
        }

        return callback(err);
    });
};


internals.generateAuthorsList = function (pluginJS) {

    if (pluginJS.author) {
        return [(pluginJS.author ? pluginJS.author.name + (pluginJS.author.email ? " <" + pluginJS.author.email + ">" : '')  : '')];
    }
    
    if (pluginJS.authors) {
        return pluginJS.authors;
    }
    
    return [];
};


internals.pluginJStoObj = function (pluginJS) {
    var schema = {
        name: Hoek.reach(pluginJS, "name"),
        description: Hoek.reach(pluginJS, "description", { default: '' }),
        version: Hoek.reach(pluginJS, "version", { default: '' }), 
        authors: internals.generateAuthorsList(pluginJS),
        license: pluginJS.license || Hoek.reach(pluginJS, "licenses.0.type", { default: '' }) || '',
        repository: Hoek.reach(pluginJS, "repository", { default: '' }),
        homepage: Hoek.reach(pluginJS, "homepage", { default: '' }),
        keywords: Hoek.reach(pluginJS, "keywords", { default: '' }),
        dependencies: Object.keys(pluginJS.dependencies || {})
    };
    return schema;
};


internals.plugin.statics.batchCreate = function(pluginsJS, callback) {

    var self = this;

    var addPlugin = function (pluginJS) {

        return function (next) {

            self.createOrUpdate(pluginJS, next);
        };
    };

    var batch = [];

    for (var i = 0, il = pluginsJS.length; i < il; ++i) {
        var pluginJS = pluginsJS[i];
        var unpublished = Hoek.reach(pluginJS, 'time.unpublished');
        if (!unpublished) {
            batch.push(addPlugin(pluginJS));
        }
    }

    Async.parallel(batch, callback);
};


internals.user = new Mongoose.Schema({
    'username': { type: String, required: false },
    'name': { type: String, required: false },
    'email': { type: String, required: false },
    'updated_at': { type: Date, default: Date.now },
    'created_at': { type: Date, default: Date.now },
    'likes': [internals.plugin]
});


internals.user.statics.get = internals.plugin.statics.get;


internals.user.methods.like = function (plugin, callback) {

    this.likes.push(plugin);
    this.save(callback);
};


internals.user.statics.getOrCreate = function (username, callback) {

    var self = this;

    this.get(username, function (err, user) {

        if (!user) {
            user = new self({ username: username});
            user.save(function (err) {

                if (err) {
                    return callback(err);
                }
                return callback(null, user);
            });
        }
        else {
            return callback(null, user);
        }
    });
};


module.exports = {
    plugin: Mongoose.model('plugin', internals.plugin),
    user: Mongoose.model('user', internals.user),
    mongoose: Mongoose
};
