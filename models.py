from datetime import datetime
from itsdangerous import URLSafeTimedSerializer as Serializer
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin

db = SQLAlchemy()

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    image_file = db.Column(db.String(20), nullable=False, default='default.svg')
    bio = db.Column(db.String(255), nullable=True)
    __table_args__ = {'extend_existing': True}
    
    password = db.Column(db.String(60), nullable=False)
    songs = db.relationship('Song', backref='uploader', lazy=True)
    likes = db.relationship('Like', backref='user', lazy=True)
    # Social relationships
    following = db.relationship('Follow', foreign_keys='Follow.follower_id', backref='follower_user', lazy=True)
    followers = db.relationship('Follow', foreign_keys='Follow.followed_id', backref='followed_user', lazy=True)
    playlists = db.relationship('Playlist', backref='owner', lazy=True)

    def get_reset_token(self, expires_sec=1800):
        # We need the app's secret key from current_app for the serializer
        from flask import current_app
        s = Serializer(current_app.config['SECRET_KEY'])
        return s.dumps({'user_id': self.id})

    @staticmethod
    def verify_reset_token(token):
        from flask import current_app
        s = Serializer(current_app.config['SECRET_KEY'])
        try:
            user_id = s.loads(token, max_age=1800)['user_id']
        except:
            return None
        return User.query.get(user_id)

# Many-to-many association table for Playlists and Songs
playlist_songs = db.Table('playlist_songs',
    db.Column('playlist_id', db.Integer, db.ForeignKey('playlist.id'), primary_key=True),
    db.Column('song_id', db.Integer, db.ForeignKey('song.id'), primary_key=True),
    db.Column('date_added', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

class Playlist(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    cover_image = db.Column(db.String(200), nullable=True) # Optional custom cover
    date_created = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationship to songs via association table
    songs = db.relationship('Song', secondary=playlist_songs, lazy='subquery',
        backref=db.backref('playlists', lazy=True))
    
    __table_args__ = {'extend_existing': True}

class Follow(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    follower_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    followed_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = {'extend_existing': True}

class Song(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    artist = db.Column(db.String(100), nullable=False)
    file_path = db.Column(db.String(200), nullable=False)
    cover_image = db.Column(db.String(200), nullable=False, default='default_cover.png')
    quality = db.Column(db.String(20), nullable=False, default='320kbps')
    lyrics = db.Column(db.Text, nullable=True)
    date_posted = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    __table_args__ = {'extend_existing': True}

class PlayHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    song_id = db.Column(db.Integer, db.ForeignKey('song.id'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = {'extend_existing': True}
    
    song = db.relationship('Song')

class Like(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    song_id = db.Column(db.Integer, db.ForeignKey('song.id'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = {'extend_existing': True}
    
    song = db.relationship('Song')
