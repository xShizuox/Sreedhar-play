import os
import secrets
from dotenv import load_dotenv
from flask import Flask, render_template, url_for, flash, redirect, request, send_from_directory, jsonify
from flask_bcrypt import Bcrypt
from flask_login import LoginManager, login_user, current_user, logout_user, login_required
from flask_mail import Mail, Message
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from models import db, User, Song, PlayHistory, Like, Playlist, Follow

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = '5791628bb0b13ce0c676dfde280ba245'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(os.path.dirname(os.path.dirname(__file__)), 'instance', 'app.db')
app.config['UPLOAD_FOLDER_MUSIC'] = os.path.join(app.root_path, 'static', 'music')
app.config['UPLOAD_FOLDER_COVERS'] = os.path.join(app.root_path, 'static', 'cover_art')
app.config['UPLOAD_FOLDER_PROFILE'] = os.path.join(app.root_path, 'static', 'profile_pics')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 * 10  # 160MB max limit

# --- Gmail SMTP Configuration ---
app.config['MAIL_SERVER'] = 'smtp.googlemail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('EMAIL_USER')
app.config['MAIL_PASSWORD'] = os.environ.get('EMAIL_PASS')

db.init_app(app)
bcrypt = Bcrypt(app)
mail = Mail(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message_category = 'info'

app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'super-secret-jwt-key')
CORS(app)
jwt = JWTManager(app)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Create tables
with app.app_context():
    db.create_all()

def serialize_songs(songs, user):
    music_data = []
    liked_ids = set([like.song_id for like in user.likes]) if user.is_authenticated else set()

    # Bulk play count — single query for all songs
    song_ids = [s.id for s in songs]
    if song_ids:
        counts = db.session.query(
            PlayHistory.song_id,
            db.func.count(PlayHistory.id).label('cnt')
        ).filter(PlayHistory.song_id.in_(song_ids)).group_by(PlayHistory.song_id).all()
        play_counts = {row.song_id: row.cnt for row in counts}
    else:
        play_counts = {}

    for s in songs:
        music_data.append({
            'id': s.id,
            'title': s.title,
            'artist': s.artist,
            'file': url_for('static', filename='music/' + s.file_path),
            'cover': url_for('static', filename='cover_art/' + s.cover_image),
            'is_liked': s.id in liked_ids,
            'play_count': play_counts.get(s.id, 0),
            'lyrics': s.lyrics
        })
    return music_data

@app.route("/")
def landing():
    return render_template('landing.html')

@app.route("/home")
@login_required
def home():
    feed_type = request.args.get('feed', 'global')
    
    if feed_type == 'following':
        followed_user_ids = [f.followed_id for f in current_user.following]
        songs = Song.query.filter(Song.user_id.in_(followed_user_ids)).order_by(Song.date_posted.desc()).all()
    else:
        songs = Song.query.order_by(Song.date_posted.desc()).all()
        
    music_data = serialize_songs(songs, current_user)
    return render_template('index.html', songs=songs, music_data=music_data, feed_type=feed_type)

@app.route("/signup", methods=['GET', 'POST'])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email').strip().lower() if request.form.get('email') else None
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')

        if not username or not email or not password:
            flash('Please fill in all fields.', 'danger')
            return redirect(url_for('signup'))

        if password != confirm_password:
            flash('Passwords must match.', 'danger')
            return redirect(url_for('signup'))
            
        user_exists = User.query.filter_by(email=email).first()
        if user_exists:
            flash('Email already registered. Please login.', 'danger')
            return redirect(url_for('signup'))
            
        user_exists_uname = User.query.filter_by(username=username).first()
        if user_exists_uname:
            flash('Username taken. Please choose another.', 'danger')
            return redirect(url_for('signup'))

        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        user = User(username=username, email=email, password=hashed_password)
        db.session.add(user)
        db.session.commit()
        flash('Account created successfully! You can now log in.', 'success')
        return redirect(url_for('login'))
    return render_template('signup.html', title='Sign Up')

@app.route("/login", methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    if request.method == 'POST':
        email = request.form.get('email').strip().lower() if request.form.get('email') else None
        password = request.form.get('password')
        user = User.query.filter_by(email=email).first()
        if user and bcrypt.check_password_hash(user.password, password):
            login_user(user, remember=True)
            next_page = request.args.get('next')
            flash('Logged in successfully!', 'success')
            return redirect(next_page) if next_page else redirect(url_for('home'))
        else:
            flash('Login Unsuccessful. Please check email and password.', 'danger')
    return render_template('login.html', title='Login')

@app.route("/logout")
def logout():
    logout_user()
    return redirect(url_for('home'))

def send_reset_email(user):
    token = user.get_reset_token()
    reset_url = url_for('reset_token', token=token, _external=True)
    msg = Message(
        subject='Sreedhar Play — Password Reset Request',
        sender=app.config['MAIL_USERNAME'],
        recipients=[user.email]
    )
    msg.body = f'''Hi {user.username},

You requested a password reset for your Sreedhar Play account.

Click the link below to set a new password (valid for 30 minutes):
{reset_url}

If you did not request this, please ignore this email.

— Sreedhar Play Team
'''
    mail.send(msg)

@app.route("/reset_password", methods=['GET', 'POST'])
def reset_request():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    if request.method == 'POST':
        email = request.form.get('email').strip().lower() if request.form.get('email') else None
        user = User.query.filter_by(email=email).first()
        if user:
            send_reset_email(user)
        # Always show success to prevent email enumeration
        flash('If an account with that email exists, a reset link has been sent. Check your inbox.', 'info')
        return redirect(url_for('login'))
    return render_template('forgot_password.html', title='Reset Password')

@app.route("/reset_password/<token>", methods=['GET', 'POST'])
def reset_token(token):
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    user = User.verify_reset_token(token)
    if not user:
        flash('That reset link is invalid or has expired (30 minute limit).', 'danger')
        return redirect(url_for('reset_request'))
    if request.method == 'POST':
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        if password != confirm_password:
            flash('Passwords must match.', 'danger')
            return redirect(url_for('reset_token', token=token))
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        user.password = hashed_password
        db.session.commit()
        flash('Your password has been updated! You can now log in.', 'success')
        return redirect(url_for('login'))
    return render_template('reset_token.html', title='Reset Password')


def save_file(form_file, folder):
    random_hex = secrets.token_hex(8)
    _, f_ext = os.path.splitext(form_file.filename)
    filename = random_hex + f_ext
    file_path = os.path.join(folder, filename)
    form_file.save(file_path)
    return filename

@app.route("/upload", methods=['GET', 'POST'])
@login_required
def upload_song():
    if request.method == 'POST':
        title = request.form.get('title')
        artist = request.form.get('artist')
        quality = request.form.get('quality', '320kbps')
        music_file = request.files.get('music_file')
        cover_file = request.files.get('cover_file')

        if not title or not artist or not music_file:
            msg = 'Please provide title, artist, and audio file.'
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'status': 'error', 'message': msg})
            flash(msg, 'danger')
            return redirect(url_for('upload_song'))
            
        if not music_file.filename.lower().endswith(('.mp3', '.wav', '.ogg', '.m4a', '.mp4', '.flac', '.aac', '.wma', '.webm')):
             msg = 'Invalid music file format. Please upload common audio extensions (mp3, wav, flac, etc.)'
             if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                 return jsonify({'status': 'error', 'message': msg})
             flash(msg, 'danger')
             return redirect(url_for('upload_song'))

        song_filename = save_file(music_file, app.config['UPLOAD_FOLDER_MUSIC'])
        cover_filename = 'default_cover.png'
        
        if cover_file and cover_file.filename:
            cover_filename = save_file(cover_file, app.config['UPLOAD_FOLDER_COVERS'])

        song = Song(title=title, artist=artist, quality=quality, file_path=song_filename, cover_image=cover_filename, uploader=current_user)
        db.session.add(song)
        db.session.commit()

        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'status': 'success', 'message': 'Song uploaded successfully!'})

        flash('Song uploaded successfully!', 'success')
        return redirect(url_for('home'))

    return render_template('upload.html', title='Upload Song')

@app.route("/api/record_play/<int:song_id>", methods=['POST'])
@login_required
def record_play(song_id):
    play_record = PlayHistory(user_id=current_user.id, song_id=song_id)
    db.session.add(play_record)
    db.session.commit()
    return {'status': 'success'}

@app.route("/api/delete_song/<int:song_id>", methods=['POST'])
@login_required
def delete_song(song_id):
    song = Song.query.get_or_404(song_id)

    # Ownership check — only uploader can delete
    if song.user_id != current_user.id:
        return {'status': 'error', 'message': 'Unauthorized'}, 403

    # Delete physical music file
    music_path = os.path.join(app.config['UPLOAD_FOLDER_MUSIC'], song.file_path)
    if os.path.exists(music_path):
        os.remove(music_path)

    # Delete cover art if not the default
    if song.cover_image != 'default_cover.png':
        cover_path = os.path.join(app.config['UPLOAD_FOLDER_COVERS'], song.cover_image)
        if os.path.exists(cover_path):
            os.remove(cover_path)

    # Cascade delete related records
    PlayHistory.query.filter_by(song_id=song.id).delete()
    Like.query.filter_by(song_id=song.id).delete()
    db.session.delete(song)
    db.session.commit()

    return {'status': 'success'}


@app.route("/api/update_lyrics/<int:song_id>", methods=['POST'])
@login_required
def update_lyrics(song_id):
    song = Song.query.get_or_404(song_id)
    if song.user_id != current_user.id:
        return {'status': 'error', 'message': 'Unauthorized'}, 403
    
    # We will accept JSON body for lyrics updates
    data = request.get_json()
    lyrics = data.get('lyrics', '') if data else request.form.get('lyrics', '')
    
    song.lyrics = lyrics
    db.session.commit()
    return {'status': 'success', 'message': 'Lyrics updated successfully!'}


@app.route("/api/toggle_like/<int:song_id>", methods=['POST'])
@login_required
def toggle_like(song_id):
    existing_like = Like.query.filter_by(user_id=current_user.id, song_id=song_id).first()
    if existing_like:
        db.session.delete(existing_like)
        liked = False
    else:
        new_like = Like(user_id=current_user.id, song_id=song_id)
        db.session.add(new_like)
        liked = True
    db.session.commit()
    return {'status': 'success', 'liked': liked}

@app.route("/api/toggle_follow/<int:user_id>", methods=['POST'])
@login_required
def toggle_follow(user_id):
    if current_user.id == user_id:
        return {'status': 'error', 'message': 'You cannot follow yourself'}
    
    existing_follow = Follow.query.filter_by(follower_id=current_user.id, followed_id=user_id).first()
    if existing_follow:
        db.session.delete(existing_follow)
        followed = False
    else:
        new_follow = Follow(follower_id=current_user.id, followed_id=user_id)
        db.session.add(new_follow)
        followed = True
    db.session.commit()
    db.session.commit()
    return {'status': 'success', 'followed': followed}

@app.route("/api/create_playlist", methods=['POST'])
@login_required
def create_playlist():
    name = request.form.get('name')
    cover_file = request.files.get('cover_image')
    
    if not name:
        return {'status': 'error', 'message': 'Playlist name is required'}, 400
    
    cover_filename = None
    if cover_file and cover_file.filename:
        # Reuse existing save_file utility
        cover_filename = save_file(cover_file, app.config['UPLOAD_FOLDER_COVERS'])
    
    playlist = Playlist(name=name, owner=current_user, cover_image=cover_filename)
    db.session.add(playlist)
    db.session.commit()
    return {'status': 'success', 'playlist_id': playlist.id, 'name': playlist.name}

@app.route("/api/playlists")
@login_required
def api_playlists():
    playlists = current_user.playlists
    data = []
    for pl in playlists:
        data.append({
            'id': pl.id,
            'name': pl.name,
            'cover': url_for('static', filename='cover_art/' + pl.cover_image) if pl.cover_image else None,
            'count': len(pl.songs)
        })
    return {'status': 'success', 'playlists': data}

@app.route("/api/add_to_playlist/<int:playlist_id>/<int:song_id>", methods=['POST'])
@login_required
def add_to_playlist(playlist_id, song_id):
    playlist = Playlist.query.get_or_404(playlist_id)
    if playlist.user_id != current_user.id:
        return {'status': 'error', 'message': 'Unauthorized'}, 403
    
    song = Song.query.get_or_404(song_id)
    if song not in playlist.songs:
        playlist.songs.append(song)
        db.session.commit()
        return {'status': 'success', 'message': 'Added to playlist'}
    return {'status': 'success', 'message': 'Already in playlist'}

@app.route("/api/remove_from_playlist/<int:playlist_id>/<int:song_id>", methods=['POST'])
@login_required
def remove_from_playlist(playlist_id, song_id):
    playlist = Playlist.query.get_or_404(playlist_id)
    if playlist.user_id != current_user.id:
        return {'status': 'error', 'message': 'Unauthorized'}, 403
    
    song = Song.query.get_or_404(song_id)
    if song in playlist.songs:
        playlist.songs.remove(song)
        db.session.commit()
    return {'status': 'success'}

@app.route("/api/delete_playlist/<int:playlist_id>", methods=['POST'])
@login_required
def delete_playlist(playlist_id):
    playlist = Playlist.query.get_or_404(playlist_id)
    if playlist.user_id != current_user.id:
        return {'status': 'error', 'message': 'Unauthorized'}, 403
    
    # Clear association table entries explicitly
    playlist.songs.clear()
    db.session.delete(playlist)
    db.session.commit()
    return {'status': 'success'}

@app.route("/api/playlist/<int:playlist_id>")
@login_required
def get_playlist(playlist_id):
    playlist = Playlist.query.get_or_404(playlist_id)
    songs = playlist.songs
    music_data = serialize_songs(songs, current_user)
    return {
        'id': playlist.id,
        'name': playlist.name,
        'description': playlist.description,
        'songs': music_data
    }

@app.route("/dashboard")
@login_required
def dashboard():
    user_songs = current_user.songs
    if not user_songs:
        flash('Upload some music to see your artist dashboard!', 'info')
        return redirect(url_for('home'))

    # Aggregate plays per song
    song_stats = []
    total_plays = 0
    song_ids = [s.id for s in user_songs]
    
    for s in user_songs:
        plays = PlayHistory.query.filter_by(song_id=s.id).count()
        total_plays += plays
        song_stats.append({
            'song': s,
            'plays': plays
        })
    
    # Sort songs by plays
    song_stats = sorted(song_stats, key=lambda x: x['plays'], reverse=True)
    
    # Find Top Fans (users who play this artist's music most)
    fan_stats = db.session.query(
        PlayHistory.user_id, 
        db.func.count(PlayHistory.id).label('play_count')
    ).filter(PlayHistory.song_id.in_(song_ids)).group_by(PlayHistory.user_id).order_by(db.desc('play_count')).limit(5).all()
    
    top_fans = []
    for fan_id, count in fan_stats:
        fan_user = User.query.get(fan_id)
        if fan_user:
            top_fans.append({'user': fan_user, 'count': count})

    return render_template('dashboard.html', title='Artist Dashboard', 
                           total_plays=total_plays, 
                           song_stats=song_stats, 
                           top_fans=top_fans,
                           follower_count=len(current_user.followers))

@app.route("/profile", methods=['GET', 'POST'])
@login_required
def profile():
    if request.method == 'POST':
        # Handle avatar upload
        if 'profile_pic' in request.files:
            pic_file = request.files['profile_pic']
            if pic_file and pic_file.filename != '':
                if pic_file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.svg')):
                    pic_filename = save_file(pic_file, app.config['UPLOAD_FOLDER_PROFILE'])
                    current_user.image_file = pic_filename
                    db.session.commit()
                    flash('Your profile picture has been updated!', 'success')
                else:
                    flash('Invalid image format.', 'danger')
                return redirect(url_for('profile'))
        
        # Handle profile details update
        if 'update_profile' in request.form:
            new_username = request.form.get('username')
            new_email = request.form.get('email').strip().lower() if request.form.get('email') else None
            new_bio = request.form.get('bio')
            
            # Validation
            if new_username and new_username != current_user.username:
                existing_user = User.query.filter_by(username=new_username).first()
                if existing_user:
                    flash('That username is taken. Please choose a different one.', 'danger')
                    return redirect(url_for('profile'))
                current_user.username = new_username
                
            if new_email and new_email != current_user.email:
                existing_email = User.query.filter_by(email=new_email).first()
                if existing_email:
                    flash('That email is already in use. Please choose a different one.', 'danger')
                    return redirect(url_for('profile'))
                current_user.email = new_email
                
            if new_bio is not None:
                current_user.bio = new_bio.strip()
                
            db.session.commit()
            flash('Your profile has been updated!', 'success')
            return redirect(url_for('profile'))

    # Fetch recently played tracks uniquely
    history_records = PlayHistory.query.filter_by(user_id=current_user.id).order_by(PlayHistory.timestamp.desc()).all()
    recent_songs = []
    seen = set()
    for record in history_records:
        if record.song and record.song_id not in seen:
            seen.add(record.song_id)
            recent_songs.append(record.song)
            if len(recent_songs) >= 10:
                break

    # Fetch Liked Songs mathematically
    liked_records = Like.query.filter_by(user_id=current_user.id).order_by(Like.timestamp.desc()).all()
    liked_songs = [record.song for record in liked_records if record.song]

    # Fetch user uploads
    user_songs = Song.query.filter_by(uploader=current_user).order_by(Song.date_posted.desc()).all()
    
    # Master serialized array so cross-section indices remain perfectly mathematically mapped natively
    master_list = recent_songs + liked_songs + user_songs
    music_data = serialize_songs(master_list, current_user)
    
    return render_template('profile.html', title='Profile', songs=user_songs, recent_songs=recent_songs, liked_songs=liked_songs, music_data=music_data, user_playlists=current_user.playlists)

@app.route("/user/<string:username>")
@login_required
def user_profile(username):
    user = User.query.filter_by(username=username).first_or_404()
    user_songs = Song.query.filter_by(uploader=user).order_by(Song.date_posted.desc()).all()
    
    is_following = False
    if current_user.is_authenticated:
        follow_record = Follow.query.filter_by(follower_id=current_user.id, followed_id=user.id).first()
        if follow_record:
            is_following = True
            
    music_data = serialize_songs(user_songs, current_user)
    user_playlists = user.playlists
    return render_template('user_profile.html', title=f"{user.username}'s Profile", user=user, songs=user_songs, music_data=music_data, is_following=is_following, user_playlists=user_playlists)

@app.route("/api/search")
def api_search():
    query = request.args.get('q', '').strip()
    if not query:
        return {'songs': [], 'users': [], 'playlists': []}
        
    songs = Song.query.filter(
        db.or_(Song.title.ilike(f'%{query}%'), Song.artist.ilike(f'%{query}%'))
    ).limit(5).all()
    
    users = User.query.filter(User.username.ilike(f'%{query}%')).limit(3).all()
    playlists = Playlist.query.filter(Playlist.name.ilike(f'%{query}%')).limit(3).all()
    
    music_data = serialize_songs(songs, current_user) if current_user.is_authenticated else []
    
    return {
        'songs': music_data,
        'users': [{'id': u.id, 'username': u.username, 'image': url_for('static', filename='profile_pics/' + u.image_file) if u.image_file else url_for('static', filename='profile_pics/default.png')} for u in users],
        'playlists': [{'id': p.id, 'name': p.name, 'owner': p.owner.username} for p in playlists]
    }

@app.route("/delete_account", methods=['POST'])
@login_required
def delete_account():
    user = current_user
    
    # 1. Delete all follows
    Follow.query.filter(db.or_(Follow.follower_id == user.id, Follow.followed_id == user.id)).delete()
    
    # 2. Delete own likes and play history
    Like.query.filter_by(user_id=user.id).delete()
    PlayHistory.query.filter_by(user_id=user.id).delete()
    
    # 3. Clean up playlists manually
    user_playlists = Playlist.query.filter_by(user_id=user.id).all()
    for p in user_playlists:
        p.songs.clear()
        db.session.delete(p)
        
    # 4. Sub-cascade for all songs uploaded by the user
    user_songs = Song.query.filter_by(user_id=user.id).all()
    from models import playlist_songs
    for s in user_songs:
        Like.query.filter_by(song_id=s.id).delete()
        PlayHistory.query.filter_by(song_id=s.id).delete()
        
        # Remove from any cross-user global playlists it was added to
        db.session.execute(playlist_songs.delete().where(playlist_songs.c.song_id == s.id))
        
        # Remove physical memory footprint securely
        try:
            song_path = os.path.join(app.config['UPLOAD_FOLDER_MUSIC'], s.file_path)
            if os.path.exists(song_path):
                os.remove(song_path)
            if s.cover_image != 'default_cover.png':
                cover_path = os.path.join(app.config['UPLOAD_FOLDER_COVERS'], s.cover_image)
                if os.path.exists(cover_path):
                    os.remove(cover_path)
        except Exception:
            pass
            
        db.session.delete(s)
        
    # 5. Erase avatar mathematically if modified
    if user.image_file != 'default.svg' and user.image_file != 'default.png':
        try:
            avatar_path = os.path.join(app.config['UPLOAD_FOLDER_PROFILE'], user.image_file)
            if os.path.exists(avatar_path):
                os.remove(avatar_path)
        except Exception:
            pass

    # Finally delete user and commit the massive cascade explicitly 
    db.session.delete(user)
    db.session.commit()
    
    logout_user()
    flash('Your account and all associated songs, interactions, and playlists have been permanently deleted.', 'info')
    return redirect(url_for('login'))

from api import api_bp
app.register_blueprint(api_bp)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
