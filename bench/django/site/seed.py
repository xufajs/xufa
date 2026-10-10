# Puts the data of the benchmark (data.mjs, as JSON) in the database of Django, after its migrations: the catalog
# emptied first, then the same rows as xufa's. The librarian may change authors (catalog.change_author).
#
#   DJANGO_SETTINGS_MODULE=benchsite.settings python seed.py data.json
import json
import sys

import django

django.setup()

from django.contrib.auth.models import Permission, User  # noqa: E402
from django.contrib.sessions.models import Session  # noqa: E402
from django.db import transaction  # noqa: E402

from catalog.models import Author, Book, BookInstance, Genre, Language  # noqa: E402


def main(file):
    with open(file, encoding='utf-8') as handle:
        data = json.load(handle)
    with transaction.atomic():
        BookInstance.objects.all().delete()
        Book.objects.all().delete()
        Author.objects.all().delete()
        Genre.objects.all().delete()
        Language.objects.all().delete()
        User.objects.all().delete()
        Session.objects.all().delete()

        genres = Genre.objects.bulk_create([Genre(name=g['name']) for g in data['genres']])
        languages = Language.objects.bulk_create([Language(name=item['name']) for item in data['languages']])
        authors = Author.objects.bulk_create(
            [
                Author(
                    first_name=a['firstName'],
                    last_name=a['lastName'],
                    date_of_birth=a['dateOfBirth'],
                    date_of_death=a['dateOfDeath'],
                )
                for a in data['authors']
            ]
        )
        books = Book.objects.bulk_create(
            [
                Book(
                    title=b['title'],
                    author=authors[b['author']],
                    summary=b['summary'],
                    isbn=b['isbn'],
                    language=languages[b['language']],
                )
                for b in data['books']
            ]
        )
        Through = Book.genre.through
        Through.objects.bulk_create(
            [Through(book_id=books[i].pk, genre_id=genres[g].pk) for i, b in enumerate(data['books']) for g in b['genres']]
        )
        users = {}
        for u in data['users']:
            users[u['username']] = User.objects.create_user(u['username'], u['email'], data['password'])
        users['librarian'].user_permissions.add(
            Permission.objects.get(codename='change_author', content_type__app_label='catalog')
        )
        BookInstance.objects.bulk_create(
            [
                BookInstance(
                    id=c['id'],
                    book=books[c['book']],
                    imprint=c['imprint'],
                    due_back=c['dueBack'],
                    status=c['status'],
                    borrower=users[c['borrower']] if c['borrower'] else None,
                )
                for c in data['copies']
            ]
        )
    print(
        f"django: seeded {len(data['authors'])} authors, {len(data['books'])} books, {len(data['copies'])} copies"
    )
    print(json.dumps({'firstAuthor': authors[0].pk, 'firstBook': books[0].pk}))


if __name__ == '__main__':
    main(sys.argv[1])
