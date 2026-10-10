# The settings of examples/django-locallibrary for the benchmark: as it is deployed at its best, not as it is
# developed. DEBUG off (cached templates), PostgreSQL through psycopg 3 with persistent connections, no static files
# middleware (a proxy serves them), no logging of requests.
import os

from locallibrary.settings import *  # noqa: F401,F403

DEBUG = False
ALLOWED_HOSTS = ['*']
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'bench-secret-key-of-the-django-side-of-the-benchmark-0123456789')
ROOT_URLCONF = 'benchsite.urls'
WSGI_APPLICATION = 'benchsite.wsgi.application'

MIDDLEWARE = [m for m in MIDDLEWARE if m != 'whitenoise.middleware.WhiteNoiseMiddleware']  # noqa: F405
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('BENCH_DB_NAME', 'bench_django'),
        'HOST': os.environ.get('BENCH_DB_HOST', '127.0.0.1'),
        'PORT': os.environ.get('BENCH_DB_PORT', '55432'),
        'USER': os.environ.get('BENCH_DB_USER', os.environ.get('USER', 'postgres')),
        'PASSWORD': os.environ.get('BENCH_DB_PASSWORD', ''),
        # A connection kept for the life of the worker (or of each thread of it), not one per request.
        'CONN_MAX_AGE': None,
        'CONN_HEALTH_CHECKS': False,
    }
}
# BENCH_DB_POOL=<size>: psycopg's pool (Django 5.1+) in each process instead, as Django advises under ASGI, whose
# threads would each keep a connection of their own.
if os.environ.get('BENCH_DB_POOL'):
    DATABASES['default']['CONN_MAX_AGE'] = 0
    DATABASES['default']['OPTIONS'] = {
        'pool': {'min_size': 2, 'max_size': int(os.environ['BENCH_DB_POOL']), 'timeout': 10}
    }

LOGGING = {'version': 1, 'disable_existing_loggers': False, 'handlers': {}, 'root': {'level': 'WARNING'}}
