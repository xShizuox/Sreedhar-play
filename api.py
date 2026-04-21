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

@api_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload():
    from app import save_file
    user_id = int(get_jwt_identity())
    current_user = User.query.get(user_id)
    
    title = request.form.get('title')
    artist = request.form.get('artist')
    quality = request.form.get('quality', '320kbps')
    
    music_file = request.files.get('music_file')
    cover_file = request.files.get('cover_file')
    
    if not title or not artist or not music_file:
        return jsonify({"msg": "Missing required fields: title, artist, and music_file are mandatory."}), 400
        
    if not music_file.filename.lower().endswith(('.mp3', '.wav', '.ogg', '.m4a', '.mp4', '.flac', '.aac', '.wma', '.webm')):
        return jsonify({"msg": "Invalid music file format."}), 400

    song_filename = save_file(music_file, current_app.config['UPLOAD_FOLDER_MUSIC'])
    cover_filename = 'default_cover.png'
    
    if cover_file and cover_file.filename:
        cover_filename = save_file(cover_file, current_app.config['UPLOAD_FOLDER_COVERS'])
        
    song = Song(title=title, artist=artist, quality=quality, file_path=song_filename, cover_image=cover_filename, uploader=current_user)
    db.session.add(song)
    db.session.commit()
    
    return jsonify({
        "msg": "Song uploaded successfully!",
        "song": {
            "id": song.id,
            "title": song.title,
            "artist": song.artist
        }
    }), 201

@api_bp.route('/search', methods=['GET'])
@jwt_required(optional=True)
def api_search():
    from app import serialize_songs
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'songs': [], 'users': [], 'playlists': []})
        
    songs = Song.query.filter(
        db.or_(Song.title.ilike(f'%{query}%'), Song.artist.ilike(f'%{query}%'))
    ).limit(10).all()
    users = User.query.filter(User.username.ilike(f'%{query}%')).limit(10).all()
    playlists = Playlist.query.filter(Playlist.name.ilike(f'%{query}%')).limit(10).all()
    
    current_user_id = get_jwt_identity()
    if current_user_id:
        current_user = User.query.get(int(current_user_id))
    else:
        from flask_login import AnonymousUserMixin
        current_user = AnonymousUserMixin()
        
    music_data = serialize_songs(songs, current_user)
    
    return jsonify({
        'songs': music_data,
        'users': [{'id': u.id, 'username': u.username, 'avatar': url_for('static', filename='profile_pics/' + u.image_file, _external=True) if u.image_file else None} for u in users],
        'playlists': [{'id': p.id, 'name': p.name, 'owner': p.owner.username} for p in playlists]
    })

@api_bp.route('/songs/<int:song_id>/like', methods=['POST'])
@jwt_required()
def toggle_like(song_id):
    user_id = int(get_jwt_identity())
    song = Song.query.get_or_404(song_id)
    like = Like.query.filter_by(user_id=user_id, song_id=song_id).first()
    
    if like:
        db.session.delete(like)
        db.session.commit()
        return jsonify({"msg": "Song unliked", "liked": False}), 200
    else:
        new_like = Like(user_id=user_id, song_id=song_id)
        db.session.add(new_like)
        db.session.commit()
        return jsonify({"msg": "Song liked", "liked": True}), 201

@api_bp.route('/profile/edit', methods=['POST'])
@jwt_required()
def edit_profile():
    from app import save_file
    user_id = int(get_jwt_identity())
    current_user = User.query.get(user_id)
    
    new_username = request.form.get('username')
    new_bio = request.form.get('bio')
    pic_file = request.files.get('avatar')
    
    if new_username and new_username != current_user.username:
        if User.query.filter_by(username=new_username).first():
            return jsonify({"msg": "Username is taken."}), 400
        current_user.username = new_username
        
    if new_bio is not None:
        current_user.bio = new_bio.strip()
        
    if pic_file and pic_file.filename:
        if pic_file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.svg')):
            pic_filename = save_file(pic_file, current_app.config['UPLOAD_FOLDER_PROFILE'])
            current_user.image_file = pic_filename
            
    db.session.commit()
    return jsonify({"msg": "Profile updated successfully!", "user": {
        "username": current_user.username,
        "bio": current_user.bio,
        "avatar": url_for('static', filename='profile_pics/' + current_user.image_file, _external=True) if current_user.image_file else None
    }})

@api_bp.route('/profile/delete', methods=['POST'])
@jwt_required()
def delete_profile():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404

    Follow.query.filter(db.or_(Follow.follower_id == user.id, Follow.followed_id == user.id)).delete()
    Like.query.filter_by(user_id=user.id).delete()
    PlayHistory.query.filter_by(user_id=user.id).delete()
    
    user_playlists = Playlist.query.filter_by(user_id=user.id).all()
    for p in user_playlists:
        p.songs.clear()
        db.session.delete(p)
        
    user_songs = Song.query.filter_by(user_id=user.id).all()
    from models import playlist_songs
    for s in user_songs:
        Like.query.filter_by(song_id=s.id).delete()
        PlayHistory.query.filter_by(song_id=s.id).delete()
        db.session.execute(playlist_songs.delete().where(playlist_songs.c.song_id == s.id))
        
        try:
            import os
            song_path = os.path.join(current_app.config['UPLOAD_FOLDER_MUSIC'], s.file_path)
            if os.path.exists(song_path): os.remove(song_path)
            if s.cover_image != 'default_cover.png':
                cover_path = os.path.join(current_app.config['UPLOAD_FOLDER_COVERS'], s.cover_image)
                if os.path.exists(cover_path): os.remove(cover_path)
        except Exception: pass
        db.session.delete(s)
        
    if user.image_file != 'default.svg' and user.image_file != 'default.png':
        try:
            import os
            avatar_path = os.path.join(current_app.config['UPLOAD_FOLDER_PROFILE'], user.image_file)
            if os.path.exists(avatar_path): os.remove(avatar_path)
        except Exception: pass

    db.session.delete(user)
    db.session.commit()
    return jsonify({"msg": "Account permanently deleted."}), 200

@api_bp.route('/profile/<int:target_user_id>', methods=['GET'])
@jwt_required(optional=True)
def get_user_profile(target_user_id):
    from app import serialize_songs
    current_user_id = get_jwt_identity()
    user = User.query.get_or_404(target_user_id)
    
    # Fetch uploads
    user_songs = Song.query.filter_by(uploader=user).order_by(Song.date_posted.desc()).all()
    
    is_following = False
    if current_user_id:
        follow_record = Follow.query.filter_by(follower_id=int(current_user_id), followed_id=user.id).first()
        if follow_record:
            is_following = True

    return jsonify({
        "user": {
            "id": user.id,
            "username": user.username,
            "bio": user.bio,
            "avatar": url_for('static', filename='profile_pics/' + user.image_file, _external=True) if user.image_file else None,
            "followers_count": len(user.followers),
            "following_count": len(user.following)
        },
        "is_following": is_following,
        "user_songs": serialize_songs(user_songs, None)
    })

@api_bp.route('/toggle_follow/<int:target_user_id>', methods=['POST'])
@jwt_required()
def toggle_follow(target_user_id):
    user_id = int(get_jwt_identity())
    
    if user_id == target_user_id:
        return jsonify({'status': 'error', 'message': 'You cannot follow yourself'}), 400
        
    existing_follow = Follow.query.filter_by(follower_id=user_id, followed_id=target_user_id).first()
    
    if existing_follow:
        db.session.delete(existing_follow)
        db.session.commit()
        return jsonify({'status': 'success', 'followed': False})
    else:
        new_follow = Follow(follower_id=user_id, followed_id=target_user_id)
        db.session.add(new_follow)
        db.session.commit()
        return jsonify({'status': 'success', 'followed': True})


@api_bp.route('/playlist/create', methods=['POST'])
@jwt_required()
def create_playlist():
    user_id = int(get_jwt_identity())
    current_user = User.query.get(user_id)
    data = request.get_json()
    name = data.get('name')
    if not name:
        return jsonify({"msg": "Playlist name required"}), 400
    
    playlist = Playlist(name=name, owner=current_user)
    db.session.add(playlist)
    db.session.commit()
    return jsonify({"msg": "Playlist created successfully", "playlist_id": playlist.id}), 201

@api_bp.route('/playlist/<int:playlist_id>/add/<int:song_id>', methods=['POST'])
@jwt_required()
def add_to_playlist(playlist_id, song_id):
    user_id = int(get_jwt_identity())
    playlist = Playlist.query.get_or_404(playlist_id)
    song = Song.query.get_or_404(song_id)
    
    if playlist.user_id != user_id:
        return jsonify({"msg": "Unauthorized"}), 403
        
    if song in playlist.songs:
        return jsonify({"msg": "Song already in playlist."}), 400
        
    playlist.songs.append(song)
    db.session.commit()
    return jsonify({"msg": "Song added to playlist."}), 200


# ── Artist Dashboard ──────────────────────────────────────────────────────────

@api_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def dashboard():
    user_id = int(get_jwt_identity())
    current_user = User.query.get(user_id)
    if not current_user:
        return jsonify({"msg": "User not found"}), 404

    user_songs = Song.query.filter_by(user_id=user_id).all()
    song_ids = [s.id for s in user_songs]

    # Per-song play counts in one query
    if song_ids:
        counts = db.session.query(
            PlayHistory.song_id,
            db.func.count(PlayHistory.id).label('cnt')
        ).filter(PlayHistory.song_id.in_(song_ids)).group_by(PlayHistory.song_id).all()
        play_counts = {row.song_id: row.cnt for row in counts}
    else:
        play_counts = {}

    total_plays = sum(play_counts.values())

    song_stats = sorted([
        {
            "id": s.id,
            "title": s.title,
            "artist": s.artist,
            "cover": url_for('static', filename='cover_art/' + s.cover_image, _external=True),
            "plays": play_counts.get(s.id, 0)
        }
        for s in user_songs
    ], key=lambda x: x['plays'], reverse=True)

    # Top fans (users who played this artist's music most)
    fan_stats = db.session.query(
        PlayHistory.user_id,
        db.func.count(PlayHistory.id).label('play_count')
    ).filter(PlayHistory.song_id.in_(song_ids)).group_by(PlayHistory.user_id)\
     .order_by(db.desc('play_count')).limit(5).all() if song_ids else []

    top_fans = []
    for fan_id, count in fan_stats:
        fan = User.query.get(fan_id)
        if fan:
            top_fans.append({
                "id": fan.id,
                "username": fan.username,
                "avatar": url_for('static', filename='profile_pics/' + fan.image_file, _external=True) if fan.image_file else None,
                "plays": count
            })

    return jsonify({
        "total_plays": total_plays,
        "follower_count": len(current_user.followers),
        "total_songs": len(user_songs),
        "song_stats": song_stats,
        "top_fans": top_fans
    }), 200


# ── Comments ──────────────────────────────────────────────────────────────────

@api_bp.route('/songs/<int:song_id>/comments', methods=['GET'])
@jwt_required(optional=True)
def get_comments(song_id):
    from models import Comment
    song = Song.query.get_or_404(song_id)
    page = request.args.get('page', 1, type=int)
    per_page = 20
    comments = Comment.query.filter_by(song_id=song_id)\
        .order_by(Comment.timestamp.desc())\
        .paginate(page=page, per_page=per_page, error_out=False)

    current_user_id = get_jwt_identity()
    return jsonify({
        "comments": [
            {
                "id": c.id,
                "content": c.content,
                "timestamp": c.timestamp.isoformat(),
                "user": {
                    "id": c.author.id,
                    "username": c.author.username,
                    "avatar": url_for('static', filename='profile_pics/' + c.author.image_file, _external=True) if c.author.image_file else None
                },
                "is_own": str(c.user_id) == str(current_user_id) if current_user_id else False
            }
            for c in comments.items
        ],
        "total": comments.total,
        "pages": comments.pages,
        "current_page": page
    }), 200


@api_bp.route('/songs/<int:song_id>/comments', methods=['POST'])
@jwt_required()
def post_comment(song_id):
    from models import Comment
    user_id = int(get_jwt_identity())
    song = Song.query.get_or_404(song_id)
    data = request.get_json()
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({"msg": "Comment cannot be empty"}), 400
    if len(content) > 500:
        return jsonify({"msg": "Comment too long (max 500 chars)"}), 400

    comment = Comment(user_id=user_id, song_id=song_id, content=content)
    db.session.add(comment)
    db.session.commit()

    user = User.query.get(user_id)
    return jsonify({
        "msg": "Comment posted",
        "comment": {
            "id": comment.id,
            "content": comment.content,
            "timestamp": comment.timestamp.isoformat(),
            "user": {
                "id": user.id,
                "username": user.username,
                "avatar": url_for('static', filename='profile_pics/' + user.image_file, _external=True) if user.image_file else None
            },
            "is_own": True
        }
    }), 201


@api_bp.route('/comments/<int:comment_id>', methods=['DELETE'])
@jwt_required()
def delete_comment(comment_id):
    from models import Comment
    user_id = int(get_jwt_identity())
    comment = Comment.query.get_or_404(comment_id)
    if comment.user_id != user_id:
        return jsonify({"msg": "Unauthorized"}), 403
    db.session.delete(comment)
    db.session.commit()
    return jsonify({"msg": "Comment deleted"}), 200
