import os
from flask import Blueprint, request, jsonify, url_for, current_app
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import db, User, Song, PlayHistory, Like, Playlist, Follow
from werkzeug.utils import secure_filename

# Configure Blueprint
api_bp = Blueprint('api_v1', __name__, url_prefix='/api/v1')

@api_bp.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password')
    
    user = User.query.filter_by(email=email).first()
    
    # Needs access to bcrypt, we'll import it from current_app or re-initialize.
    # To avoid circular imports, checking password locally via the bcrypt extension
    from app import bcrypt 
    if user and bcrypt.check_password_hash(user.password, password):
        access_token = create_access_token(identity=str(user.id))
        return jsonify(access_token=access_token, user={'id': user.id, 'username': user.username, 'email': user.email}), 200
    
    return jsonify({"msg": "Bad email or password"}), 401


@api_bp.route('/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email', '').strip().lower()
    password = data.get('password')
    
    if not username or not email or not password:
        return jsonify({"msg": "Missing fields"}), 400
        
    if User.query.filter_by(email=email).first():
        return jsonify({"msg": "Email already registered"}), 400
        
    if User.query.filter_by(username=username).first():
        return jsonify({"msg": "Username taken"}), 400
        
    from app import bcrypt
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    user = User(username=username, email=email, password=hashed_password)
    db.session.add(user)
    db.session.commit()
    
    return jsonify({"msg": "Account created successfully"}), 201


@api_bp.route('/feed', methods=['GET'])
@jwt_required(optional=True)
def feed():
    from app import serialize_songs
    feed_type = request.args.get('feed', 'global')
    current_user_id = get_jwt_identity()
    
    if current_user_id:
        current_user = User.query.get(int(current_user_id))
    else:
        from flask_login import AnonymousUserMixin
        current_user = AnonymousUserMixin()

    if feed_type == 'following' and current_user:
        followed_user_ids = [f.followed_id for f in current_user.following]
        songs = Song.query.filter(Song.user_id.in_(followed_user_ids)).order_by(Song.date_posted.desc()).all()
    else:
        songs = Song.query.order_by(Song.date_posted.desc()).all()
        
    music_data = serialize_songs(songs, current_user)
    return jsonify({"songs": music_data})


@api_bp.route('/profile', methods=['GET'])
@jwt_required()
def profile():
    from app import serialize_songs
    user_id = int(get_jwt_identity())
    current_user = User.query.get(user_id)
    if not current_user:
        return jsonify({"msg": "User not found"}), 404

    # Fetch recently played
    history_records = PlayHistory.query.filter_by(user_id=current_user.id).order_by(PlayHistory.timestamp.desc()).all()
    recent_songs = []
    seen = set()
    for record in history_records:
        if record.song and record.song_id not in seen:
            seen.add(record.song_id)
            recent_songs.append(record.song)
            if len(recent_songs) >= 10: break

    # Fetch Liked
    liked_records = Like.query.filter_by(user_id=current_user.id).order_by(Like.timestamp.desc()).all()
    liked_songs = [record.song for record in liked_records if record.song]

    # Fetch uploads
    user_songs = Song.query.filter_by(uploader=current_user).order_by(Song.date_posted.desc()).all()
    
    return jsonify({
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "bio": current_user.bio,
            "avatar": url_for('static', filename='profile_pics/' + current_user.image_file, _external=True) if current_user.image_file else None
        },
        "recent_songs": serialize_songs(recent_songs, current_user),
        "liked_songs": serialize_songs(liked_songs, current_user),
        "user_songs": serialize_songs(user_songs, current_user),
        "playlists": [{"id": pl.id, "name": pl.name, "cover": url_for('static', filename='cover_art/' + pl.cover_image, _external=True) if pl.cover_image else None} for pl in current_user.playlists]
    })
