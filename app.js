var express=require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var mysql = require('mysql');
var count = 0;
var db = {
	config: {
		host: 'localhost',
		user: 'root',
		password: 'root',
		database: 'chatdb',
		connectionLimit : 300,
		pool:{ maxConnections: 300, maxIdleTime: 300}
	},_tmp:{
		md5arr:{}
	}
	,
	init: function() {
		var _this=this;
		  pool = mysql.createPool(this.config);
		pool.on('connection', function (connection) {
		  connection.query('SET SESSION auto_increment_increment=1');
		});
		pool.on('enqueue', function () {
		  console.log('Waiting for available connection slot');
		});
 
		 return pool;
	},
	sqlQuery: function(sql, fn) {
			//	console.log(sql);
		 	this.init().getConnection(function(err, connection){
		 		connection.query(sql, function(err, rows, fields) {
					fn && fn(err, rows, fields);
				})
				connection.release();//连接池
		 	})

	},
	getUserinfo: function(userinfo, fn) {
		var _this = this, _sql = "",sql="";
		if(userinfo.me){
			_sql += " username='" + userinfo.me +"'";
		}

		if(userinfo.me&&userinfo.you){
			_sql += " or "+" username='" + userinfo.you +"' " ;
		}
		if(!_sql) return false;

           sql = "select * from userinfo where " + _sql + " order by id desc";
		var arr = [];

		_this.sqlQuery(sql, function(err, rows, fields) {
			if (err) {
				//throw err;
				//console.log(err);

			} else if (rows>0) {
				for (var i = rows.length - 1; i >= 0; i--) {

					arr.push({
						username: rows[i].username,
						face: rows[i].face,
						nichen: rows[i].nichen
					})
				}
 
				fn && fn(arr);

			}
		})


	},
	getUserMD5: function(username, fn) {
	var _this = this;
 		return	new Promise(function(resolve, reject){
 			 	if(!_this._tmp.md5arr[username]){ //减少数据库的查询
	 			var sql = "select MD5 from userinfo where username='" + username + "' limit 1";
	 			 
				_this.sqlQuery(sql, function(err, rows, fields) {
					if (err) {
						//throw err;
						resolve(false);
					} else if (rows.length>0) { //返回行数判断 以免MD5值underfind
					 _this._tmp.md5arr[username]=rows[0].MD5; 
		 			  resolve(rows[0].MD5);
					}
				})
					}else{
 
			 		 resolve(_this._tmp.md5arr[username])
			 	}
 		})
			
	 	
	},
	setUserlogindate: function(username, fn) {
		var _this = this;
		var sql = "update userinfo set logdate='" + new Date().getTime() + "' where username='" + username + "'";

		 _this.sqlQuery(sql, function(err, rows, fields) {
			if (err) {
				// throw err;

			} else if(rows.length>0) {
				fn && fn(rows.changedRows);

			}

		})

	},insertchatmsg:function(data,fn){
		var _this=this;
		var sql = 'insert into chat_history (username,friends,date,msg) values ("' + data.me + '","' + data.you + '",' + new Date().getTime() + ',"' + data.msg + '")';
 
			_this.sqlQuery(sql, function(err, rows, fields) {
				if (err) {
					//throw err;
					//console.log(err)

				} else if (rows.length>0) {
					fn && fn(rows)
					

				}
			})
	},getHistory:function(data,fn){
		var _sql=" (username='" + data.me+ "' and friends='"+data.you+"') or "+" (username='" + data.you+ "' and friends='"+data.me+"')";
		var sql = "select * from chat_history where"+ _sql +" order by id desc limit  " + data.count;
			//查找发送给“我”的聊天
			db.sqlQuery(sql, function(err, rows, fields) {
				if (err) {
					//throw err;
					//console.log(err)

				} else if (rows.length>0) {

					var array = [];

					for (var i = rows.length - 1; i >= 0; i--) {
						//倒叙返回数组 
						array.push({
							server: "resHistory",
							me: rows[i].username,
							you: rows[i].friends,
							msg: rows[i].msg
						});

					}
					fn&&fn(array)

				}

			});
	}
}
 

var logic = {
	stripscript: function(s) {
		var pattern = new RegExp("'()/\/" + '"')
		var rs = "";
		for (var i = 0; i < s.length; i++) {
			rs = rs + s.substr(i, 1).replace(pattern, '');
		}
		return rs;
	},
	do: function(items, data) {
		//console.log(items);
		var _this=this;
		if (data.me) data.me = this.stripscript(data.me);
		if (data.you) data.you = this.stripscript(data.you);
		if (data.msg) data.msg = this.stripscript(data.msg); /* 暂时统一过滤特殊字符 */

		switch (items) {
		case "chat"://聊天信息传送

			db.setUserlogindate(data.me, function(changedRows) {
			//	console.log(data.me + "刚刚登陆了！")
			})
			db.insertchatmsg(data,function(rows){
				 _this.emitfn("chat",data.you, data); //给对方发送消息
				 _this.emitfn("chat",data.me, data); //给我发送消息 即使我的消息也由服务器返回消息
			});
			
			//console.log(data.me + " 发送给：" + data.you);
			break;
		case "userInfo"://用户配置信息
 			 db.getUserinfo(data, function(cbdata) {
				_this.emitfn("userInfo",data.me, cbdata);
				 
			})
		break;
		case "input":

		_this.emitfn("input",data.you,data.stu);

		break;
		case "getHistory"://历史消息
				
			db.getHistory(data,function(array){
				_this.emitfn("resHistory",data.me, array); //返回请求历史消息的一方
			});
			
			break;
		}

	},emitfn:function(mark,msgto,data){
		db.getUserMD5(msgto).then(function (value) {
			    console.log(msgto+":"+value);    
			   io.emit(mark+msgto+value, data);
			}).catch(function (error) {
			    console.log(error);
			});
		
	},addlisten:function(obj,room,fn){
		obj.on(room, function(data) {
		 logic.do(room, data);
		  fn&&fn(room,data);
	 })
	}
	,
	server: function() {
		//console.log(path.join(__dirname, 'chatClient')) //设置访问目录
	   app.use(express.static(path.join(__dirname, 'chatClient')))	
	 //   	app.use(express.cookieParser());
		// app.use(express.session());
 
	},createConnection:function(socket){
		var _this=this;
			
			_this.addlisten(socket,"chat",function(room,data){

			}) 
			_this.addlisten(socket,"userInfo",function(room,data){
				
			}) 

			_this.addlisten(socket,"getHistory",function(room,data){
				
			}) 
			_this.addlisten(socket,"input",function(room,data){
				
			}) 
	},
	init: function() {
		var _this=this;
			_this.server();		
		var loadHistory = true;
		// connection.end();
		io.on('connection', function(socket) {
			count++;
			_this.addlisten(socket,"disconnect",function(data){
				count--;
				console.log(count + "人在线");
			})

	  		_this.createConnection(socket);
  		 

		});
		
		
		app.use(function (err, req, res, next) {
			res.status(err.status || 500);
			res.render('error', {
				message: err.message,
				error: {}
			});
		});
		http.listen(8080, function(data) {
			console.log('listening on *:8080');
		});
	}

}
logic.init();

	 
 