<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
| This route returns the welcome view which contains the button and popup.
*/

Route::get('/', function () {
    return view('welcome');
});
