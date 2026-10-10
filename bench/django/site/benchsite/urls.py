# The pages of examples/django-locallibrary, with the queries of the pages measured as xufa's port makes them (the
# tutorial's views load the author of each book of a list one by one; here select_related and prefetch_related, as
# a tuned Django app would), and two of the benchmark: a text, and a book as JSON.
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.urls import include, path
from django.views.generic import RedirectView

from catalog import views
from catalog.models import Book, BookInstance


class BookList(views.BookListView):
    queryset = Book.objects.select_related('author')


class BookDetail(views.BookDetailView):
    queryset = Book.objects.select_related('author', 'language').prefetch_related('genre', 'bookinstance_set')


class LoanedBooksByUser(views.LoanedBooksByUserListView):
    def get_queryset(self):
        return super().get_queryset().select_related('book')


def hello(request):
    return HttpResponse('Hello, World!', content_type='text/plain; charset=utf-8')


def book_json(request, pk):
    book = get_object_or_404(Book.objects.select_related('author', 'language').prefetch_related('genre'), pk=pk)
    return JsonResponse(
        {
            'id': book.pk,
            'title': book.title,
            'isbn': book.isbn,
            'author': {'id': book.author_id, 'firstName': book.author.first_name, 'lastName': book.author.last_name},
            'language': book.language.name if book.language else None,
            'genres': [genre.name for genre in book.genre.all()],
        }
    )


urlpatterns = [
    path('bench/hello', hello),
    path('bench/book/<int:pk>.json', book_json),
    path('catalog/books/', BookList.as_view(), name='books'),
    path('catalog/book/<int:pk>', BookDetail.as_view(), name='book-detail'),
    path('catalog/mybooks/', LoanedBooksByUser.as_view(), name='my-borrowed'),
    path('catalog/', include('catalog.urls')),
    path('accounts/', include('django.contrib.auth.urls')),
    path('', RedirectView.as_view(url='/catalog/', permanent=True)),
]
