from app import app
from flask import render_template
import logging

with app.app_context():
    try:
        app.jinja_env.get_template('user_profile.html')
        print("Template user_profile.html syntactically valid.")
    except Exception as e:
        print("Error in profile.html:", str(e))
